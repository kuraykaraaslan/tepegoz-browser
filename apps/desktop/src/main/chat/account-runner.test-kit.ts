import { vi } from 'vitest';
import type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatMessage,
} from '@tepegoz/shared-types';
import { XMPP_CAPS } from '@tepegoz/chat-adapters';
import {
  ChatAccountRunner,
  type AccountRunnerDeps,
  type ChatAuditEvent,
  type ChatRunnerStore,
  type RunnerEmit,
} from './account-runner';

export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

class EventChannel {
  private queue: unknown[] = [];
  private waiters: Array<(r: IteratorResult<unknown>) => void> = [];
  private ended = false;
  push(v: unknown): void {
    const w = this.waiters.shift();
    if (w !== undefined) w({ value: v, done: false });
    else this.queue.push(v);
  }
  end(): void {
    this.ended = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true });
  }
  async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    for (;;) {
      const v = this.queue.shift();
      if (v !== undefined) {
        yield v;
        continue;
      }
      if (this.ended) return;
      const n = await new Promise<IteratorResult<unknown>>((r) => this.waiters.push(r));
      if (n.done === true) return;
      yield n.value;
    }
  }
}

export class FakeAdapter {
  readonly id = 'xmpp';
  readonly capabilities = XMPP_CAPS;
  channel = new EventChannel();
  sent: Array<{ conv: string; body: string }> = [];
  historyPages: ChatMessage[] = [];
  rosterContacts: ChatContact[] = [];
  session = { accountId: 'acc', caps: XMPP_CAPS };

  connect = vi.fn(() => Promise.resolve(this.session));
  disconnect = vi.fn(() => Promise.resolve());
  events = vi.fn(() => this.channel);
  sendMessage = vi.fn((_s: unknown, conv: string, body: { body: string }) => {
    this.sent.push({ conv, body: body.body });
    return Promise.resolve({ protocolId: `srv-${String(this.sent.length)}`, ts: 1000 });
  });
  setPresence = vi.fn(() => Promise.resolve());
  markRead = vi.fn(() => Promise.resolve());
  history = vi.fn(() => Promise.resolve({ messages: this.historyPages, nextCursor: null }));
  roster = vi.fn(() => Promise.resolve(this.rosterContacts));
  addContact = vi.fn(() => Promise.resolve());
  removeContact = vi.fn(() => Promise.resolve());
  listConversations = vi.fn(() => Promise.resolve([]));
  discoverRooms = vi.fn(() =>
    Promise.resolve([
      {
        jid: 'g@conf',
        name: 'G',
        description: null,
        occupants: 2,
        passwordProtected: false,
        membersOnly: false,
      },
    ]),
  );
  joinRoom = vi.fn((_s: unknown, jid: string) =>
    Promise.resolve({
      id: jid,
      accountId: 'acc',
      kind: 'room' as const,
      address: jid,
      name: jid,
      topic: '',
      memberCount: 0,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      mutedUntil: null,
      notifyLevel: 'all' as const,
      isKnownContact: true,
      archived: false,
      lastMessage: null,
      updatedAt: 1,
    }),
  );
  setRoomTopic = vi.fn(() => Promise.resolve());
  inviteToRoom = vi.fn(() => Promise.resolve());
  resolveMedia? = vi.fn((_s: unknown, ref: string) =>
    ref.startsWith('mxc://')
      ? { url: `https://hs.example/media/${ref.slice(6)}`, headers: { authorization: 'Bearer t' } }
      : null,
  );
}

export class FakeStore implements ChatRunnerStore {
  messages: ChatMessage[] = [];
  conversations = new Map<string, ChatConversation>();
  contacts: ChatContact[] = [];
  redacted: Array<[string, string]> = [];
  upsertMessage(m: ChatMessage): void {
    const i = this.messages.findIndex(
      (x) => x.conversationId === m.conversationId && x.protocolId === m.protocolId,
    );
    if (i >= 0) this.messages[i] = m;
    else this.messages.push(m);
  }
  redactMessage(c: string, p: string): void {
    this.redacted.push([c, p]);
  }
  upsertConversation(c: ChatConversation): void {
    this.conversations.set(c.id, c);
  }
  upsertContact(c: ChatContact): void {
    this.contacts.push(c);
  }
  setContactBlocked(accountId: string, address: string, blocked: boolean): void {
    const c = this.contacts.find((x) => x.accountId === accountId && x.address === address);
    if (c !== undefined) c.blocked = blocked;
  }
  getConversation(id: string): ChatConversation | null {
    return this.conversations.get(id) ?? null;
  }
  listMessages(conversationId: string): ChatMessage[] {
    return this.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.originTs - b.originTs);
  }
  listRoomIds(accountId: string): string[] {
    return [...this.conversations.values()]
      .filter((c) => c.kind === 'room' && c.accountId === accountId)
      .map((c) => c.id);
  }
  listReadMarkers(accountId: string): Array<{ id: string; lastReadId: string | null }> {
    return [...this.conversations.values()]
      .filter((c) => c.accountId === accountId)
      .map((c) => ({ id: c.id, lastReadId: c.lastReadId }));
  }
}

export const account: ChatAccount = {
  id: 'acc',
  label: 'Work',
  displayName: 'Ada',
  server: {
    protocol: 'xmpp',
    jid: 'ada@example.com',
    host: null,
    port: null,
    security: 'tls',
    wsUrl: null,
  },
  secretRef: 'chat:acc',
  color: null,
  order: 0,
  updatedAt: 0,
  version: 1,
};

export type Deps = AccountRunnerDeps;

export function makeDeps(over: Partial<Deps> & { adapter: FakeAdapter; store: ChatRunnerStore }): {
  deps: Deps;
  emitted: RunnerEmit[];
} {
  const emitted: RunnerEmit[] = [];
  const now = 1_000;
  const deps: Deps = {
    account,
    secret: 'pencil',
    adapter: over.adapter,
    transport: over.transport ?? ({} as Deps['transport']),
    store: over.store,
    now: over.now ?? (() => now),
    setTimer: over.setTimer ?? ((fn) => fn),
    clearTimer: over.clearTimer ?? (() => undefined),
    mayEgress: over.mayEgress ?? (() => true),
    emit: (e: RunnerEmit) => emitted.push(e),
  };
  return { deps, emitted };
}

export type DepsOverride = Partial<Omit<Deps, 'adapter' | 'store'>>;

export function harness(over: DepsOverride = {}) {
  const adapter = new FakeAdapter();
  const store = new FakeStore();
  const { deps, emitted } = makeDeps({ adapter, store, ...over });
  const notifications: Array<{ conversationId: string; title: string; body: string }> = [];
  deps.notify = (n) => notifications.push(n);
  const audits: ChatAuditEvent[] = [];
  deps.audit = (e) => audits.push(e);
  return { runner: new ChatAccountRunner(deps), adapter, store, emitted, notifications, audits };
}

export const incomingMessage = (
  protocolId: string,
  body: string,
): { type: 'message'; message: ChatMessage } => ({
  type: 'message',
  message: {
    id: protocolId,
    conversationId: 'bob@example.com',
    accountId: 'acc',
    protocolId,
    senderAddress: 'bob@example.com',
    senderName: 'Bob',
    kind: 'text',
    body,
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: 500,
    receivedAt: 501,
    deliveryState: 'delivered',
  },
});

export async function online(over: DepsOverride = {}) {
  const h = harness(over);
  h.runner.start();
  await tick();
  return h;
}
