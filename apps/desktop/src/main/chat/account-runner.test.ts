import { describe, it, expect, vi } from 'vitest';
import type { ChatAccount, ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { XMPP_CAPS } from '@tepegoz/chat-adapters';
import {
  ChatAccountRunner,
  type AccountRunnerDeps,
  type ChatRunnerStore,
  type RunnerEmit,
} from './account-runner';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

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

class FakeAdapter {
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
  listConversations = vi.fn(() => Promise.resolve([]));
  discoverRooms = vi.fn(() =>
    Promise.resolve([
      { jid: 'g@conf', name: 'G', description: null, occupants: 2, passwordProtected: false, membersOnly: false },
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
      notifyLevel: 'all' as const,
      isKnownContact: true,
      updatedAt: 1,
    }),
  );
}

class FakeStore implements ChatRunnerStore {
  messages: ChatMessage[] = [];
  conversations = new Map<string, ChatConversation>();
  contacts: ChatContact[] = [];
  redacted: Array<[string, string]> = [];
  upsertMessage(m: ChatMessage): void {
    const i = this.messages.findIndex((x) => x.conversationId === m.conversationId && x.protocolId === m.protocolId);
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
  getConversation(id: string): ChatConversation | null {
    return this.conversations.get(id) ?? null;
  }
}

const account: ChatAccount = {
  id: 'acc',
  label: 'Work',
  displayName: 'Ada',
  server: { protocol: 'xmpp', jid: 'ada@example.com', host: null, port: null, security: 'tls', wsUrl: null },
  secretRef: 'chat:acc',
  color: null,
  order: 0,
  updatedAt: 0,
  version: 1,
};

type Deps = AccountRunnerDeps;

function makeDeps(over: Partial<Deps> & { adapter: FakeAdapter; store: ChatRunnerStore }): {
  deps: Deps;
  emitted: RunnerEmit[];
} {
  const emitted: RunnerEmit[] = [];
  const now = 1_000;
  const deps: Deps = {
    account,
    secret: 'pencil',
    adapter: over.adapter,
    transport: {} as Deps['transport'],
    store: over.store,
    now: over.now ?? (() => now),
    setTimer: over.setTimer ?? ((fn) => fn),
    clearTimer: over.clearTimer ?? (() => undefined),
    mayEgress: over.mayEgress ?? (() => true),
    emit: (e: RunnerEmit) => emitted.push(e),
  };
  return { deps, emitted };
}

function harness() {
  const adapter = new FakeAdapter();
  const store = new FakeStore();
  const { deps, emitted } = makeDeps({ adapter, store });
  return { runner: new ChatAccountRunner(deps), adapter, store, emitted };
}

const incomingMessage = (
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

describe('ChatAccountRunner — connect + ingest', () => {
  it('starts, goes online, and persists an incoming message', async () => {
    const { runner, adapter, store, emitted } = harness();
    runner.start();
    await tick();
    expect(runner.connState).toBe('online');

    adapter.channel.push(incomingMessage('m1', 'selam'));
    await tick();
    expect(store.messages.map((m) => m.body)).toEqual(['selam']);
    expect(store.conversations.get('bob@example.com')?.unread).toBe(1);
    expect(emitted.some((e) => e.kind === 'change' && e.change.kind === 'message')).toBe(true);
    expect(emitted.some((e) => e.kind === 'state' && e.state === 'online')).toBe(true);
  });

  it('drops an invalid raw event without persisting', async () => {
    const { runner, adapter, store, emitted } = harness();
    runner.start();
    await tick();
    adapter.channel.push({ type: 'garbage' });
    await tick();
    expect(store.messages).toHaveLength(0);
    expect(emitted.some((e) => e.kind === 'change' && e.change.kind === 'dropped')).toBe(true);
  });

  it('persists an edit and a redaction', async () => {
    const { runner, adapter, store } = harness();
    runner.start();
    await tick();
    adapter.channel.push(incomingMessage('m1', 'oops'));
    await tick();
    adapter.channel.push({ type: 'message-edit', conversationId: 'bob@example.com', protocolId: 'm1', body: 'fixed', editedAt: 9 });
    await tick();
    expect(store.messages[0]?.body).toBe('fixed');
    adapter.channel.push({ type: 'message-redact', conversationId: 'bob@example.com', protocolId: 'm1', redactedAt: 10 });
    await tick();
    expect(store.redacted).toEqual([['bob@example.com', 'm1']]);
  });
});

describe('ChatAccountRunner — actions', () => {
  async function online() {
    const h = harness();
    h.runner.start();
    await tick();
    return h;
  }

  it('sendMessage echoes pending then reconciles to the server id', async () => {
    const { runner, adapter, store } = await online();
    const id = await runner.sendMessage('bob@example.com', { body: 'hi' });
    expect(id).toBe('srv-1');
    expect(adapter.sent).toEqual([{ conv: 'bob@example.com', body: 'hi' }]);
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]?.protocolId).toBe('srv-1');
    expect(store.messages[0]?.deliveryState).toBe('sent');
  });

  it('history seeds the conversation and returns the page', async () => {
    const { runner, adapter, store } = await online();
    adapter.historyPages = [incomingMessage('h1', 'old').message];
    const page = await runner.history('bob@example.com', null);
    expect(page.messages).toHaveLength(1);
    expect(store.messages.map((m) => m.protocolId)).toEqual(['h1']);
  });

  it('roster persists every contact', async () => {
    const { runner, adapter, store } = await online();
    adapter.rosterContacts = [
      { id: 'acc:c@x', accountId: 'acc', address: 'c@x', name: 'C', groups: [], presence: 'offline', statusText: '', subscription: 'both' },
    ];
    expect(await runner.roster()).toHaveLength(1);
    expect(store.contacts).toHaveLength(1);
  });

  it('discoverRooms passes through the adapter; joinRoom persists the room conversation', async () => {
    const { runner, adapter, store } = await online();
    expect(await runner.discoverRooms('conf.example')).toEqual([
      { jid: 'g@conf', name: 'G', description: null, occupants: 2, passwordProtected: false, membersOnly: false },
    ]);
    expect(adapter.discoverRooms).toHaveBeenCalled();

    await runner.joinRoom('general@conf.example');
    expect(adapter.joinRoom).toHaveBeenCalledWith(expect.anything(), 'general@conf.example');
    expect(store.conversations.get('general@conf.example')?.kind).toBe('room');
  });

  it('discoverRooms / joinRoom no-op when the adapter lacks MUC support', async () => {
    const { runner, adapter } = await online();
    // @ts-expect-error deliberately drop the optional methods
    adapter.discoverRooms = undefined;
    // @ts-expect-error deliberately drop the optional methods
    adapter.joinRoom = undefined;
    expect(await runner.discoverRooms('conf.example')).toEqual([]);
    await expect(runner.joinRoom('x@conf')).resolves.toBeUndefined();
  });

  it('a roster-remove event is not persisted as a contact', async () => {
    const { adapter, store } = await online();
    const contact = { id: 'acc:c@x', accountId: 'acc', address: 'c@x', name: '', groups: [], presence: 'offline' as const, statusText: '', subscription: 'none' as const };
    adapter.channel.push({ type: 'roster-change', removed: true, contact });
    await tick();
    expect(store.contacts).toHaveLength(0);
  });

  it('markRead folds unread down and reaches the adapter', async () => {
    const { runner, adapter, store } = await online();
    adapter.channel.push(incomingMessage('m1', 'a'));
    adapter.channel.push(incomingMessage('m2', 'b'));
    await tick();
    await tick();
    expect(store.conversations.get('bob@example.com')?.unread).toBe(2);
    await runner.markRead('bob@example.com', 'm2');
    expect(store.conversations.get('bob@example.com')?.unread).toBe(0);
    expect(adapter.markRead).toHaveBeenCalledWith(expect.anything(), 'bob@example.com', 'm2');
  });

  it('setPresence / markRead reach the adapter', async () => {
    const { runner, adapter } = await online();
    await runner.setPresence('dnd', 'busy');
    expect(adapter.setPresence).toHaveBeenCalledWith(expect.anything(), 'dnd', 'busy');
    await runner.markRead('bob@example.com', 'm1');
    expect(adapter.markRead).toHaveBeenCalled();
  });

  it('actions throw before the account is connected', async () => {
    const { runner } = harness();
    await expect(runner.sendMessage('c', { body: 'x' })).rejects.toThrow(/not connected/);
    await expect(runner.roster()).rejects.toThrow(/not connected/);
  });

  it('stop() disconnects and notifyEgressChange delegates', async () => {
    const { runner, adapter } = await online();
    await runner.stop();
    expect(adapter.disconnect).toHaveBeenCalled();
    runner.notifyEgressChange(); // no throw
  });

  it('emits a state change with a detail on connect failure', async () => {
    const adapter = new FakeAdapter();
    adapter.connect = vi.fn(() => Promise.reject(new Error('bad password')));
    const { deps, emitted } = makeDeps({ adapter, store: new FakeStore() });
    new ChatAccountRunner(deps).start();
    await tick();
    expect(emitted.find((e) => e.kind === 'state' && e.state === 'error')).toMatchObject({
      detail: 'bad password',
    });
  });

  it('treats a groupchat address (with a resource) as a room conversation', async () => {
    const { adapter, store } = await online();
    const base = incomingMessage('g1', 'hi').message;
    adapter.channel.push({ type: 'message', message: { ...base, conversationId: 'room@conf/ada' } });
    await tick();
    expect(store.conversations.get('room@conf/ada')?.kind).toBe('room');
  });

  it('derives the self identity per protocol (incl. the bridge fallback)', async () => {
    for (const [server, store] of [
      [{ protocol: 'irc', server: 'irc.x', port: 6697, tls: true, nick: 'ada', sasl: false }, new FakeStore()],
      [{ protocol: 'matrix', homeserverUrl: 'https://x', userId: '@ada:x' }, new FakeStore()],
      [{ protocol: 'bridge', bridgeId: 'telegram', config: {} }, new FakeStore()],
    ] as const) {
      const adapter = new FakeAdapter();
      const { deps } = makeDeps({ adapter, store });
      deps.account = { ...account, server: { ...server } };
      new ChatAccountRunner(deps).start();
      await tick();
      // a mention of the display name counts (proves selfNames was seeded whatever the protocol)
      adapter.channel.push(incomingMessage('m', 'hey Ada'));
      await tick();
      expect(store.conversations.get('bob@example.com')?.mentions).toBe(1);
    }
  });
});
