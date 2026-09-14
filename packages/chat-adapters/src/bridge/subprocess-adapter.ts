import { z } from 'zod';
import {
  ProcessSupervisor,
  type ProcessSupervisorConfig,
  type SpawnFn,
} from '@tepegoz/adapter-subprocess';
import {
  ChatContactSchema,
  ChatConversationSchema,
  ChatMessageSchema,
  type ChatAdapterCaps,
} from '@tepegoz/shared-types';
import type {
  ChatAccountCreds,
  ChatAdapter,
  ChatSession,
  HistoryPage,
  RoomSummary,
  SendReceipt,
} from '../adapter';

/**
 * X-chat.8: the `ChatAdapter`-over-subprocess consumer ADR-0048 names — turns the generic
 * `@tepegoz/adapter-subprocess` supervisor into an actual bridge adapter by mapping every
 * `ChatAdapter` method onto a typed RPC `call()`. Every response is `safeParse`d against the
 * matching `@tepegoz/shared-types` schema (or a local one, for the three shapes — `HistoryPage` /
 * `SendReceipt` / `RoomSummary` — that are `chat-adapters`-only types with no shared-types schema).
 *
 * `events()` deliberately does NOT re-validate against `ChatEventSchema` here: it yields the RAW,
 * still-`unknown` `params` from a decoded event frame, exactly like every native adapter's `events()`
 * does with its own raw wire shape — `ChatAccountState.applyRaw` already runs EVERY adapter's stream
 * through `normalizeEvent` centrally (`@tepegoz/chat-core`), subprocess or not, so re-validating here
 * too would just be the same check running twice for no benefit.
 *
 * One `ProcessSupervisor` per connected account (`connect()` spawns; `disconnect()` stops) — a
 * crashing bridge account cannot affect another account's subprocess, matching ADR-0048 §2's
 * crash-isolation guarantee at the adapter layer (the OS-level guarantees — state-dir confinement,
 * egress binding — are the caller's `cwd`/`env`/profile-binding to supply, not this class's job; see
 * `ProcessSupervisor`'s own docstring for the same split).
 */
export interface SubprocessChatAdapterConfig {
  spawn: SpawnFn;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  /** A stable id for this bridge, e.g. `bridge:telegram` — becomes {@link ChatAdapter.id}. */
  id: string;
  capabilities: ChatAdapterCaps;
  command: string;
  args?: readonly string[];
  env?: Record<string, string>;
  /** The account's own state directory (ADR-0048 §2.1) — the caller's job to have already confined
   *  this to `<extension-id>/<adapter-instance-id>/state/`; this class only forwards it as `cwd`. */
  stateDirFor: (accountId: string) => string;
  supervisorOptions?: Pick<
    ProcessSupervisorConfig,
    'callTimeoutMs' | 'heartbeatIntervalMs' | 'heartbeatTimeoutMs' | 'maxLifetimeMs' | 'backoffMs' | 'maxRestarts'
  >;
}

const SendReceiptSchema = z.object({ protocolId: z.string().min(1), ts: z.number() });
const HistoryPageSchema = z.object({
  messages: z.array(ChatMessageSchema),
  nextCursor: z.string().nullable(),
});
const RoomSummarySchema = z.object({
  jid: z.string().min(1),
  name: z.string().nullable(),
  description: z.string().nullable(),
  occupants: z.number().nullable(),
  passwordProtected: z.boolean(),
  membersOnly: z.boolean(),
});
export class SubprocessChatAdapter implements ChatAdapter {
  readonly id: string;
  readonly capabilities: ChatAdapterCaps;
  private readonly supervisors = new Map<string, ProcessSupervisor>();

  constructor(private readonly config: SubprocessChatAdapterConfig) {
    this.id = config.id;
    this.capabilities = config.capabilities;
  }

  private supervisorFor(session: ChatSession): ProcessSupervisor {
    const supervisor = this.supervisors.get(session.accountId);
    if (supervisor === undefined) {
      throw new Error(`subprocess adapter: no live subprocess for account "${session.accountId}"`);
    }
    return supervisor;
  }

  private callVoid(session: ChatSession, method: string, params: unknown): Promise<void> {
    return this.supervisorFor(session)
      .call(method, params, z.unknown())
      .then(() => undefined);
  }

  async connect(creds: ChatAccountCreds): Promise<ChatSession> {
    const supervisor = new ProcessSupervisor(
      {
        command: this.config.command,
        ...(this.config.args !== undefined ? { args: this.config.args } : {}),
        // The same env-carries-secret convention `manifest.mcpServer.env` already uses for an MCP
        // server's own config/tokens — not a new channel invented for this adapter.
        env: {
          ...(this.config.env ?? {}),
          TEPEGOZ_BRIDGE_ACCOUNT_ID: creds.accountId,
          TEPEGOZ_BRIDGE_SECRET: creds.secret,
        },
        cwd: this.config.stateDirFor(creds.accountId),
        ...(this.config.supervisorOptions ?? {}),
      },
      {
        spawn: this.config.spawn,
        setTimer: this.config.setTimer,
        clearTimer: this.config.clearTimer,
        ...(this.config.log !== undefined ? { log: this.config.log } : {}),
      },
    );
    supervisor.start();
    this.supervisors.set(creds.accountId, supervisor);
    // A "connect" RPC round trip proves the child is actually ready to serve calls, rather than
    // trusting the process merely having spawned — ProcessSupervisor's own state only tracks the OS
    // process, not the bridge's internal readiness (it has no way to know that on its own).
    await supervisor.call('connect', { server: creds.server }, z.unknown());
    return { accountId: creds.accountId, caps: this.capabilities };
  }

  disconnect(session: ChatSession): Promise<void> {
    const supervisor = this.supervisors.get(session.accountId);
    this.supervisors.delete(session.accountId);
    supervisor?.stop();
    return Promise.resolve();
  }

  roster(session: ChatSession) {
    return this.supervisorFor(session).call('roster', undefined, z.array(ChatContactSchema));
  }

  addContact(session: ChatSession, address: string): Promise<void> {
    return this.callVoid(session, 'addContact', { address });
  }

  removeContact(session: ChatSession, address: string): Promise<void> {
    return this.callVoid(session, 'removeContact', { address });
  }

  setPresence(session: ChatSession, presence: unknown, statusText?: string): Promise<void> {
    return this.callVoid(session, 'setPresence', { presence, statusText });
  }

  listConversations(session: ChatSession) {
    return this.supervisorFor(session).call(
      'listConversations',
      undefined,
      z.array(ChatConversationSchema),
    );
  }

  history(session: ChatSession, conv: string, before: string | null): Promise<HistoryPage> {
    return this.supervisorFor(session).call('history', { conv, before }, HistoryPageSchema);
  }

  sendMessage(session: ChatSession, conv: string, body: unknown): Promise<SendReceipt> {
    return this.supervisorFor(session).call('sendMessage', { conv, body }, SendReceiptSchema);
  }

  editMessage(session: ChatSession, conv: string, id: string, body: unknown): Promise<void> {
    return this.callVoid(session, 'editMessage', { conv, id, body });
  }

  react(session: ChatSession, conv: string, id: string, emoji: string, on: boolean): Promise<void> {
    return this.callVoid(session, 'react', { conv, id, emoji, on });
  }

  markRead(session: ChatSession, conv: string, upTo: string): Promise<void> {
    return this.callVoid(session, 'markRead', { conv, upTo });
  }

  joinRoom(session: ChatSession, address: string) {
    return this.supervisorFor(session).call('joinRoom', { address }, ChatConversationSchema);
  }

  leaveRoom(session: ChatSession, conv: string): Promise<void> {
    return this.callVoid(session, 'leaveRoom', { conv });
  }

  inviteToRoom(session: ChatSession, conv: string, invitee: string): Promise<void> {
    return this.callVoid(session, 'inviteToRoom', { conv, invitee });
  }

  setRoomTopic(session: ChatSession, conv: string, topic: string): Promise<void> {
    return this.callVoid(session, 'setRoomTopic', { conv, topic });
  }

  discoverRooms(session: ChatSession, service: string): Promise<RoomSummary[]> {
    return this.supervisorFor(session).call(
      'discoverRooms',
      { service },
      z.array(RoomSummarySchema),
    );
  }

  uploadMedia(session: ChatSession, media: unknown): Promise<string> {
    return this.supervisorFor(session).call('uploadMedia', { media }, z.string());
  }

  // `ChatAdapter.resolveMedia` is deliberately NOT implemented here: it is optional on the interface
  // and its real signature is SYNCHRONOUS (turn a ref into a URL + headers, no network call), which a
  // subprocess cannot honor — resolving needs an RPC round trip. Bridges therefore cannot support
  // media resolution through this generic adapter yet; a bridge declaring `media: true` in its
  // capabilities would need a different seam (not attempted in this slice — flagged, not stubbed).

  /** Yields the RAW `params` of every event frame the child sends, still fully `unknown` — see the
   *  class docstring for why no `ChatEventSchema` validation happens here. */
  events(session: ChatSession): AsyncIterable<unknown> {
    const supervisor = this.supervisorFor(session);
    const queue: unknown[] = [];
    let resolveNext: (() => void) | null = null;
    const unsubscribe = supervisor.onEvent((_event, params) => {
      queue.push(params);
      resolveNext?.();
      resolveNext = null;
    });
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<unknown>> => {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
          }
          const value = queue.shift();
          return { value, done: false };
        },
        return: (): Promise<IteratorResult<unknown>> => {
          unsubscribe();
          return Promise.resolve({ value: undefined, done: true });
        },
      }),
    };
  }
}
