import type { ChatAccount, ChatContact, ChatMessage } from '@tepegoz/shared-types';
import type { ChatAdapter, ChatTransport, RoomSummary } from '@tepegoz/chat-adapters';
import { BRIDGE_DEFAULT_CAPS, IrcAdapter, MatrixAdapter, SubprocessChatAdapter, XmppAdapter } from '@tepegoz/chat-adapters';
import type { SpawnFn } from '@tepegoz/adapter-subprocess';
import type { ChatConnState } from '@tepegoz/chat-core';
import { AppError } from '@tepegoz/libs';
import {
  ChatAccountRunner,
  type ChatAuditEvent,
  type ChatNotification,
  type ChatRunnerStore,
  type RunnerEmit,
} from './account-runner';

/**
 * The main-process owner of every live chat account: a map of `ChatAccountRunner`s, plus the
 * lifecycle that gates them — the extension being enabled, the profile in force, and the Phase-5
 * kill switch. All IO (the account list, the secret store, the DB-backed runner store, the egress
 * check, timers) is injected, so this is unit-tested against fakes; the `.electron.ts` adapter
 * supplies the real ones.
 */

export interface ChatSecretStore {
  get: (ref: string) => Promise<string | null>;
  set: (ref: string, plain: string) => Promise<void>;
  delete: (ref: string) => Promise<void>;
}

/** What a registered bridge needs to spawn — the (still design-only past this) manifest field ADR-0048
 *  and X-chat.9 own; nothing produces this yet outside tests. */
export interface BridgeSpawnSpec {
  command: string;
  args?: readonly string[];
  env?: Record<string, string>;
}

export interface ChatServiceDeps {
  /** The persisted, non-tombstoned accounts (from `ChatStore.listAccounts`). */
  loadAccounts: () => ChatAccount[];
  /** Persist / read / drop an account's vault secret (safeStorage-backed in the app). */
  secrets: ChatSecretStore;
  /** Persist an account row / drop it. */
  persistAccount: (account: ChatAccount) => void;
  deleteAccount: (id: string) => void;
  /** A fresh runner store (DB-backed) — one is handed to each runner. */
  makeRunnerStore: () => ChatRunnerStore;
  /** Override the adapter for a protocol (tests); defaults to `XmppAdapter` for `xmpp`. */
  makeAdapter?: (account: ChatAccount) => ChatAdapter;
  /** Resolve a `bridge` account's `bridgeId` to the command that runs it (X-chat.9's manifest
   *  registry, once one exists). `undefined` / a `null` return means "no bridge registered for this
   *  id" — the account surfaces as `error`, same as any other protocol with no adapter yet. */
  resolveBridge?: (bridgeId: string) => BridgeSpawnSpec | null;
  /** Real `node:child_process.spawn`, injected — only exercised once `resolveBridge` finds a match. */
  spawnBridge?: SpawnFn;
  /** The account's confined state directory (ADR-0048 §2.1), passed to the child as `cwd`. */
  bridgeStateDirFor?: (accountId: string) => string;
  transport: ChatTransport;
  mayEgress: () => boolean;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  emit: (event: RunnerEmit) => void;
  /** Raise a notification for a message that survived `decideNotification`. Optional. */
  notify?: (notification: ChatNotification) => void;
  /** Record a redacted "message sent" fact in the Event Journal. Optional. */
  audit?: (event: ChatAuditEvent) => void;
  /** Whether the `com.tepegoz.chat` extension is enabled. */
  isEnabled: () => boolean;
}

export class ChatService {
  private readonly runners = new Map<string, ChatAccountRunner>();
  private started = false;

  constructor(private readonly deps: ChatServiceDeps) {}

  /** Load the persisted accounts and, if the extension is enabled, connect them. */
  async start(): Promise<void> {
    this.started = true;
    if (!this.deps.isEnabled()) return;
    for (const account of this.deps.loadAccounts()) {
      await this.spinUp(account);
    }
  }

  private async spinUp(account: ChatAccount): Promise<void> {
    if (this.runners.has(account.id)) return;
    const secret = await this.deps.secrets.get(account.secretRef);
    if (secret === null) {
      this.emitError(account.id, 'no stored credential');
      return;
    }

    let adapter: ChatAdapter;
    try {
      adapter = this.makeAdapter(account);
    } catch (err) {
      this.emitError(account.id, err instanceof Error ? err.message : String(err));
      return;
    }

    const runner = new ChatAccountRunner({
      account,
      secret,
      adapter,
      transport: this.deps.transport,
      store: this.deps.makeRunnerStore(),
      now: this.deps.now,
      setTimer: this.deps.setTimer,
      clearTimer: this.deps.clearTimer,
      mayEgress: this.deps.mayEgress,
      emit: this.deps.emit,
      ...(this.deps.notify !== undefined ? { notify: this.deps.notify } : {}),
      ...(this.deps.audit !== undefined ? { audit: this.deps.audit } : {}),
    });
    this.runners.set(account.id, runner);
    runner.start();
  }

  private emitError(accountId: string, detail: string): void {
    this.deps.emit({ kind: 'state', accountId, state: 'error', detail });
  }

  private makeAdapter(account: ChatAccount): ChatAdapter {
    if (this.deps.makeAdapter !== undefined) return this.deps.makeAdapter(account);
    if (account.server.protocol === 'xmpp') return new XmppAdapter();
    if (account.server.protocol === 'irc') return new IrcAdapter();
    if (account.server.protocol === 'matrix') return new MatrixAdapter();
    if (account.server.protocol === 'bridge') return this.makeBridgeAdapter(account.server.bridgeId);
    // Exhaustiveness guard: every `ChatServerConfig` variant is handled above, so `account.server` is
    // `never` here — a future 5th protocol variant fails this assignment at compile time instead of
    // silently falling through to a vague runtime error.
    const unhandled: never = account.server;
    throw new AppError(`Chat: no adapter for protocol "${JSON.stringify(unhandled)}" yet`, 501);
  }

  private makeBridgeAdapter(bridgeId: string): ChatAdapter {
    const spec = this.deps.resolveBridge?.(bridgeId) ?? null;
    if (spec === null || this.deps.spawnBridge === undefined || this.deps.bridgeStateDirFor === undefined) {
      throw new AppError(`Chat: no bridge registered for "${bridgeId}"`, 501);
    }
    return new SubprocessChatAdapter({
      spawn: this.deps.spawnBridge,
      setTimer: this.deps.setTimer,
      clearTimer: this.deps.clearTimer,
      id: `bridge:${bridgeId}`,
      capabilities: BRIDGE_DEFAULT_CAPS,
      command: spec.command,
      ...(spec.args !== undefined ? { args: spec.args } : {}),
      ...(spec.env !== undefined ? { env: spec.env } : {}),
      stateDirFor: this.deps.bridgeStateDirFor,
    });
  }

  /** Add an account: store its secret, persist the row, and (if live) connect it. */
  async addAccount(account: ChatAccount, plainSecret: string): Promise<void> {
    await this.deps.secrets.set(account.secretRef, plainSecret);
    this.deps.persistAccount(account);
    this.deps.audit?.({
      kind: 'account-added',
      accountId: account.id,
      protocol: account.server.protocol,
      ts: this.deps.now(),
    });
    if (this.started && this.deps.isEnabled()) await this.spinUp(account);
  }

  /**
   * Update an account's config and, optionally, its vault secret — `plainSecret === null` keeps the
   * one already in the vault (the edit form never round-trips a stored secret, so it can only ever
   * offer "leave blank to keep it" or "type a new one"). The connection settings may have just
   * changed (host, port, nick, …), so the live runner (if any) is stopped and rebuilt against the
   * new row rather than patched in place.
   */
  async updateAccount(account: ChatAccount, plainSecret: string | null): Promise<void> {
    const runner = this.runners.get(account.id);
    if (runner !== undefined) {
      await runner.stop();
      this.runners.delete(account.id);
    }
    if (plainSecret !== null) await this.deps.secrets.set(account.secretRef, plainSecret);
    this.deps.persistAccount(account);
    if (this.started && this.deps.isEnabled()) await this.spinUp(account);
  }

  async removeAccount(id: string): Promise<void> {
    const runner = this.runners.get(id);
    if (runner !== undefined) {
      await runner.stop();
      this.runners.delete(id);
    }
    const account = this.deps.loadAccounts().find((a) => a.id === id);
    if (account !== undefined) await this.deps.secrets.delete(account.secretRef);
    this.deps.deleteAccount(id);
  }

  /** Stop every runner (profile switch, app quit). */
  async stop(): Promise<void> {
    await Promise.all([...this.runners.values()].map((r) => r.stop()));
    this.runners.clear();
  }

  /** The extension was enabled or disabled. */
  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      if (this.started) await this.start();
    } else {
      await this.stop();
    }
  }

  /** The active profile's egress binding changed (kill switch on/off, connection up/down). */
  notifyEgressChange(): void {
    for (const runner of this.runners.values()) runner.notifyEgressChange();
  }

  accountStates(): Record<string, ChatConnState> {
    const out: Record<string, ChatConnState> = {};
    for (const [id, runner] of this.runners) out[id] = runner.connState;
    return out;
  }

  private require(accountId: string): ChatAccountRunner {
    const runner = this.runners.get(accountId);
    if (runner === undefined) throw new AppError(`Chat account "${accountId}" is not connected`, 409);
    return runner;
  }

  async sendMessage(
    accountId: string,
    conversationId: string,
    body: { body: string; replyToId?: string | null },
  ): Promise<string> {
    return this.require(accountId).sendMessage(conversationId, body);
  }

  async setPresence(
    accountId: string,
    presence: ChatContact['presence'],
    statusText?: string,
  ): Promise<void> {
    return this.require(accountId).setPresence(presence, statusText);
  }

  async markRead(accountId: string, conversationId: string, protocolId: string): Promise<void> {
    return this.require(accountId).markRead(conversationId, protocolId);
  }

  async history(
    accountId: string,
    conversationId: string,
    before: string | null,
  ): Promise<{ messages: ChatMessage[]; nextCursor: string | null }> {
    return this.require(accountId).history(conversationId, before);
  }

  async roster(accountId: string): Promise<ChatContact[]> {
    return this.require(accountId).roster();
  }

  async discoverRooms(accountId: string, service: string): Promise<RoomSummary[]> {
    return this.require(accountId).discoverRooms(service);
  }

  async joinRoom(accountId: string, roomJid: string): Promise<string | null> {
    return this.require(accountId).joinRoom(roomJid);
  }

  async leaveRoom(accountId: string, conversationId: string): Promise<void> {
    return this.require(accountId).leaveRoom(conversationId);
  }

  async setRoomNotifyLevel(
    accountId: string,
    conversationId: string,
    level: 'all' | 'mentions' | 'none',
  ): Promise<void> {
    return this.require(accountId).setRoomNotifyLevel(conversationId, level);
  }

  async setMuted(accountId: string, conversationId: string, muted: boolean): Promise<void> {
    return this.require(accountId).setMuted(conversationId, muted);
  }

  async muteFor(accountId: string, conversationId: string, durationMs: number | null): Promise<void> {
    return this.require(accountId).muteFor(conversationId, durationMs);
  }

  async setArchived(accountId: string, conversationId: string, archived: boolean): Promise<void> {
    return this.require(accountId).setArchived(conversationId, archived);
  }

  async blockContact(accountId: string, address: string, blocked: boolean): Promise<void> {
    return this.require(accountId).blockContact(address, blocked);
  }

  async setRoomTopic(accountId: string, conversationId: string, topic: string): Promise<void> {
    return this.require(accountId).setRoomTopic(conversationId, topic);
  }

  async inviteToRoom(accountId: string, conversationId: string, invitee: string): Promise<void> {
    return this.require(accountId).inviteToRoom(conversationId, invitee);
  }

  async addContact(accountId: string, address: string): Promise<void> {
    return this.require(accountId).addContact(address);
  }

  async removeContact(accountId: string, address: string): Promise<void> {
    return this.require(accountId).removeContact(address);
  }

  async react(
    accountId: string,
    conversationId: string,
    messageId: string,
    emoji: string,
    on: boolean,
  ): Promise<void> {
    return this.require(accountId).react(conversationId, messageId, emoji, on);
  }

  async editMessage(
    accountId: string,
    conversationId: string,
    messageId: string,
    body: string,
  ): Promise<void> {
    return this.require(accountId).editMessage(conversationId, messageId, body);
  }

  async resolveMedia(
    accountId: string,
    mediaRef: string,
  ): Promise<{ dataUrl: string } | null> {
    return this.require(accountId).resolveMedia(mediaRef);
  }
}
