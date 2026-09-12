import { describe, it, expect, vi } from 'vitest';
import type { ChatAccount, ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { XMPP_CAPS } from '@tepegoz/chat-adapters';
import { openDatabase, migrate, ChatStore } from '@tepegoz/persistence';
import {
  ChatAccountRunner,
  type AccountRunnerDeps,
  type ChatAuditEvent,
  type ChatRunnerStore,
  type RunnerEmit,
} from './account-runner';
import { makeRunnerStore } from './chat-store-adapter';

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
  addContact = vi.fn(() => Promise.resolve());
  removeContact = vi.fn(() => Promise.resolve());
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
  setRoomTopic = vi.fn(() => Promise.resolve());
  inviteToRoom = vi.fn(() => Promise.resolve());
  resolveMedia?= vi.fn((_s: unknown, ref: string) =>
    ref.startsWith('mxc://')
      ? { url: `https://hs.example/media/${ref.slice(6)}`, headers: { authorization: 'Bearer t' } }
      : null,
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

type DepsOverride = Partial<Omit<Deps, 'adapter' | 'store'>>;

function harness(over: DepsOverride = {}) {
  const adapter = new FakeAdapter();
  const store = new FakeStore();
  const { deps, emitted } = makeDeps({ adapter, store, ...over });
  const notifications: Array<{ conversationId: string; title: string; body: string }> = [];
  deps.notify = (n) => notifications.push(n);
  const audits: ChatAuditEvent[] = [];
  deps.audit = (e) => audits.push(e);
  return { runner: new ChatAccountRunner(deps), adapter, store, emitted, notifications, audits };
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

  it('rejoins every already-known room on connect, so occupants + send ability come back after a restart', async () => {
    const { runner, adapter, store } = harness();
    store.upsertConversation({
      id: 'known@conf.example',
      accountId: 'acc',
      kind: 'room',
      address: 'known@conf.example',
      name: 'known',
      topic: '',
      memberCount: 0,
      unread: 3,
      mentions: 0,
      lastReadId: null,
      muted: false,
      notifyLevel: 'all',
      isKnownContact: true,
      updatedAt: 1,
    });
    // A DM must never be treated as a room to rejoin.
    store.upsertConversation({
      id: 'bob@example.com',
      accountId: 'acc',
      kind: 'dm',
      address: 'bob@example.com',
      name: 'Bob',
      topic: '',
      memberCount: 2,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      notifyLevel: 'all',
      isKnownContact: true,
      updatedAt: 1,
    });

    runner.start();
    await tick();

    expect(adapter.joinRoom).toHaveBeenCalledTimes(1);
    expect(adapter.joinRoom).toHaveBeenCalledWith(expect.anything(), 'known@conf.example');
  });

  it('one room failing to rejoin does not block the others or the connection', async () => {
    const { runner, adapter, store } = harness();
    store.upsertConversation({
      id: 'banned@conf.example',
      accountId: 'acc',
      kind: 'room',
      address: 'banned@conf.example',
      name: 'banned',
      topic: '',
      memberCount: 0,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      notifyLevel: 'all',
      isKnownContact: true,
      updatedAt: 1,
    });
    store.upsertConversation({
      id: 'ok@conf.example',
      accountId: 'acc',
      kind: 'room',
      address: 'ok@conf.example',
      name: 'ok',
      topic: '',
      memberCount: 0,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      notifyLevel: 'all',
      isKnownContact: true,
      updatedAt: 1,
    });
    adapter.joinRoom.mockImplementationOnce(() => Promise.reject(new Error('banned')));

    runner.start();
    await tick();

    expect(runner.connState).toBe('online');
    expect(adapter.joinRoom).toHaveBeenCalledTimes(2);
    expect(adapter.joinRoom).toHaveBeenCalledWith(expect.anything(), 'ok@conf.example');
  });
});

describe('ChatAccountRunner — actions', () => {
  async function online(over: DepsOverride = {}) {
    const h = harness(over);
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

  it('X-chat.10: the "message sent" audit fact carries no body, address or secret', async () => {
    const { runner, audits } = await online();
    await runner.sendMessage('secret-room@conf.example', { body: 'MEETME_AT_MIDNIGHT plaintext' });
    expect(audits).toHaveLength(1);
    const json = JSON.stringify(audits[0]);
    expect(json).not.toContain('MEETME_AT_MIDNIGHT');
    expect(json).not.toContain('secret-room@conf.example');
    expect(json).not.toContain('pencil'); // the runner's vault secret (makeDeps `secret: 'pencil'`)
    const fact = audits[0];
    expect(fact).toMatchObject({ kind: 'message-sent', accountId: 'acc', protocolId: 'srv-1' });
    expect(fact?.kind === 'message-sent' && fact.conversationHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('history seeds the conversation and returns the page', async () => {
    const { runner, adapter, store } = await online();
    adapter.historyPages = [incomingMessage('h1', 'old').message];
    const page = await runner.history('bob@example.com', null);
    expect(page.messages).toHaveLength(1);
    expect(store.messages.map((m) => m.protocolId)).toEqual(['h1']);
  });

  it('history returns what is already persisted locally even while disconnected', async () => {
    const { runner, adapter, store } = harness();
    // Never started — no session — a live MAM fetch is impossible.
    store.upsertMessage(incomingMessage('h1', 'earlier').message);
    const page = await runner.history('bob@example.com', null);
    expect(page.messages.map((m) => m.protocolId)).toEqual(['h1']);
    expect(adapter.history).not.toHaveBeenCalled();
  });

  it('history falls back to local storage when the live fetch fails (e.g. no MAM support)', async () => {
    const { runner, adapter, store } = await online();
    store.upsertMessage(incomingMessage('h1', 'earlier').message);
    adapter.history.mockRejectedValueOnce(new Error('feature-not-implemented'));
    const page = await runner.history('bob@example.com', null);
    expect(page.messages.map((m) => m.protocolId)).toEqual(['h1']);
  });

  it('history merges local + live, live winning on a duplicate protocol id', async () => {
    const { runner, adapter, store } = await online();
    store.upsertMessage(incomingMessage('h1', 'stale local copy').message);
    adapter.historyPages = [{ ...incomingMessage('h1', 'fresh from server').message, originTs: 500 }];
    const page = await runner.history('bob@example.com', null);
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.body).toBe('fresh from server');
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

  it('setRoomTopic delegates to the adapter', async () => {
    const { runner, adapter } = await online();
    await runner.setRoomTopic('#c', 'agenda for today');
    expect(adapter.setRoomTopic).toHaveBeenCalledWith(expect.anything(), '#c', 'agenda for today');
  });

  it('inviteToRoom delegates to the adapter', async () => {
    const { runner, adapter } = await online();
    await runner.inviteToRoom('#c', 'carol');
    expect(adapter.inviteToRoom).toHaveBeenCalledWith(expect.anything(), '#c', 'carol');
  });

  it('addContact delegates to the adapter', async () => {
    const { runner, adapter } = await online();
    await runner.addContact('bob@example.com');
    expect(adapter.addContact).toHaveBeenCalledWith(expect.anything(), 'bob@example.com');
  });

  it('removeContact delegates to the adapter', async () => {
    const { runner, adapter } = await online();
    await runner.removeContact('bob@example.com');
    expect(adapter.removeContact).toHaveBeenCalledWith(expect.anything(), 'bob@example.com');
  });

  it('persists a room-topic change onto the stored conversation row', async () => {
    const { adapter, store } = await online();
    store.upsertConversation({
      id: '#c', accountId: 'acc', kind: 'room', address: '#c', name: '#c', topic: '',
      memberCount: 0, unread: 0, mentions: 0, lastReadId: null, muted: false,
      notifyLevel: 'all', isKnownContact: true, updatedAt: 1,
    });
    adapter.channel.push({ type: 'room-topic', conversationId: '#c', topic: 'Release week', setBy: 'op', ts: null });
    await tick();
    expect(store.conversations.get('#c')?.topic).toBe('Release week');
  });

  it('a room-membership event for a room never explicitly joined creates the conversation row', async () => {
    // Regression: Matrix reports every room the account is already a member of on its very first
    // `/sync` — no `joinRoom()` call in between, unlike a room entered interactively through the
    // UI (which persists its row directly). Before this fix, `case 'room'` only ever UPDATED an
    // existing row, so a passively-discovered room got none — and the room's first message event
    // (same sync, or any later one) violated the real `chat_messages` table's foreign key on
    // `conversation_id`, crashing the event pump and forcing a reconnect that re-hit the same gap
    // on every retry: an account with any pre-existing Matrix room history could never come online.
    const { adapter, store } = await online();
    expect(store.getConversation('!room:example')).toBeNull();
    adapter.channel.push({
      type: 'room-membership',
      conversationId: '!room:example',
      address: 'ada@example.com',
      realJid: null,
      affiliation: 'none',
      role: 'participant',
      joined: true,
      self: true,
    });
    await tick();
    expect(store.getConversation('!room:example')).toMatchObject({ id: '!room:example', kind: 'room' });
  });

  it('a message from a contact with no prior conversation creates the conversation row first', async () => {
    // Regression, same shape as the room-membership one above but for a plain 1:1: chat-core's
    // `foldConversation` emits a `'message'` change and its paired `'conversation'` change together,
    // message FIRST — so by the time `applyChange` reached the real `ChatStore.upsertMessage` for a
    // DM's very first-ever message, no `chat_conversations` row existed yet and the FK on
    // `chat_messages.conversation_id` threw, crashing the event pump (confirmed against the real
    // SQLite-backed store, not this fixture, which doesn't enforce the constraint and so never
    // caught it).
    const { adapter, store } = await online();
    expect(store.getConversation('bob@example.com')).toBeNull();
    adapter.channel.push(incomingMessage('p1', 'hi'));
    await tick();
    expect(store.getConversation('bob@example.com')).toMatchObject({ id: 'bob@example.com', kind: 'dm' });
  });

  it('setRoomNotifyLevel patches the stored conversation (creating a stub if needed)', async () => {
    const { runner, store } = await online();
    await runner.setRoomNotifyLevel('room@conf', 'mentions');
    expect(store.conversations.get('room@conf')?.notifyLevel).toBe('mentions');

    store.upsertConversation({ ...store.conversations.get('room@conf')!, name: 'Kept' });
    await runner.setRoomNotifyLevel('room@conf', 'none');
    const row = store.conversations.get('room@conf');
    expect(row?.notifyLevel).toBe('none');
    expect(row?.name).toBe('Kept');
  });

  it('discoverRooms / joinRoom no-op when the adapter lacks MUC support', async () => {
    const { runner, adapter } = await online();
    // @ts-expect-error deliberately drop the optional methods
    adapter.discoverRooms = undefined;
    // @ts-expect-error deliberately drop the optional methods
    adapter.joinRoom = undefined;
    expect(await runner.discoverRooms('conf.example')).toEqual([]);
    await expect(runner.joinRoom('x@conf')).resolves.toBeNull();
  });

  it('joinRoom returns the new conversation id', async () => {
    const { runner } = await online();
    await expect(runner.joinRoom('general@conf.example')).resolves.toBe('general@conf.example');
  });

  it('leaveRoom calls the adapter when it supports it and marks the row not-known', async () => {
    const { runner, adapter, store } = await online();
    const leave = vi.fn(() => Promise.resolve());
    (adapter as unknown as { leaveRoom: typeof leave }).leaveRoom = leave;
    await runner.joinRoom('general@conf.example');
    await runner.leaveRoom('general@conf.example');
    expect(leave).toHaveBeenCalledWith(expect.anything(), 'general@conf.example');
    expect(store.conversations.get('general@conf.example')?.isKnownContact).toBe(false);
  });

  it('setMuted patches the stored conversation; react needs adapter support', async () => {
    const { runner, store } = await online();
    await runner.setMuted('room@conf', true);
    expect(store.conversations.get('room@conf')?.muted).toBe(true);
    await expect(runner.react('room@conf', 'm1', '👍', true)).rejects.toThrow(/reactions/);
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

  describe('resolveMedia', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchOk = vi.fn(() =>
      Promise.resolve({
        status: 200,
        headers: { 'content-type': 'image/png; charset=binary' },
        text: () => Promise.resolve(''),
        bytes: () => Promise.resolve(png),
      }),
    );

    it('resolves an mxc ref to a size-capped, sanitized data URL via the egress-bound transport', async () => {
      const { runner, adapter } = await online({ transport: { fetch: fetchOk } as unknown as Deps['transport'] });
      const out = await runner.resolveMedia('mxc://hs.example/AbC');
      expect(adapter.resolveMedia).toHaveBeenCalledWith(expect.anything(), 'mxc://hs.example/AbC');
      expect(fetchOk).toHaveBeenCalledWith(
        'https://hs.example/media/hs.example/AbC',
        expect.objectContaining({ method: 'GET', headers: { authorization: 'Bearer t' } }),
      );
      expect(out).toEqual({ dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}` });
    });

    it('returns null when the adapter cannot resolve the ref', async () => {
      const { runner } = await online({ transport: { fetch: fetchOk } as unknown as Deps['transport'] });
      expect(await runner.resolveMedia('https://not-a-ref/x')).toBeNull();
    });

    it('returns null on an oversized download', async () => {
      const big = new Uint8Array(13 * 1024 * 1024);
      const fetchBig = vi.fn(() =>
        Promise.resolve({ status: 200, headers: {}, text: () => Promise.resolve(''), bytes: () => Promise.resolve(big) }),
      );
      const { runner } = await online({ transport: { fetch: fetchBig } as unknown as Deps['transport'] });
      expect(await runner.resolveMedia('mxc://hs.example/big')).toBeNull();
    });

    it('throws when the kill-switch trips after connect', async () => {
      let egress = true;
      const { runner } = await online({
        transport: { fetch: fetchOk } as unknown as Deps['transport'],
        mayEgress: () => egress,
      });
      egress = false;
      await expect(runner.resolveMedia('mxc://hs.example/AbC')).rejects.toThrow(/kill-switch/);
    });

    it('returns null when the adapter has no media repo', async () => {
      const { runner, adapter } = await online({ transport: { fetch: fetchOk } as unknown as Deps['transport'] });
      Reflect.deleteProperty(adapter, 'resolveMedia');
      expect(await runner.resolveMedia('mxc://hs.example/AbC')).toBeNull();
    });
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

describe('ChatAccountRunner — notifications', () => {
  async function online(over: DepsOverride = {}) {
    const h = harness(over);
    h.runner.start();
    await tick();
    return h;
  }

  it('raises a notification for an inbound DM message, titled by the sender', async () => {
    const { adapter, notifications } = await online();
    adapter.channel.push(incomingMessage('m1', 'ping'));
    await tick();
    expect(notifications).toEqual([
      { accountId: 'acc', conversationId: 'bob@example.com', title: 'Bob', body: 'ping' },
    ]);
  });

  it('does not notify for the account\'s own echo or a redacted message', async () => {
    const { adapter, notifications } = await online();
    const own = incomingMessage('m1', 'mine');
    own.message.senderAddress = 'ada@example.com';
    adapter.channel.push(own);
    adapter.channel.push({
      type: 'message-redact',
      conversationId: 'bob@example.com',
      protocolId: 'm2',
      redactedAt: 9,
    });
    await tick();
    expect(notifications).toEqual([]);
  });

  it('does not notify for the account\'s own room message — matched by occupant nick, not raw address', async () => {
    const { adapter, store, notifications } = await online();
    store.conversations.set('room@conf', {
      id: 'room@conf', accountId: 'acc', kind: 'room', address: 'room@conf', name: 'Room', topic: '',
      memberCount: 1, unread: 0, mentions: 0, lastReadId: null, muted: false, notifyLevel: 'all',
      isKnownContact: true, updatedAt: 1,
    });
    // Self-presence (XEP-0045 status 110 equivalent) — sets this account's nick in the room.
    adapter.channel.push({
      type: 'room-membership',
      conversationId: 'room@conf',
      address: 'room@conf/Ada',
      realJid: null,
      affiliation: 'member',
      role: 'participant',
      joined: true,
      self: true,
    });
    await tick();
    // Our own message, echoed back by the MUC — `senderAddress` is the room-prefixed occupant JID,
    // never equal to `selfBareJid` (ada@example.com), which is exactly the bug this test guards.
    const own = incomingMessage('r1', 'my own line');
    own.message.conversationId = 'room@conf';
    own.message.senderAddress = 'room@conf/Ada';
    own.message.senderName = 'Ada';
    adapter.channel.push(own);
    await tick();
    expect(notifications).toEqual([]);
  });

  it('respects a room set to "mentions" — a plain line is silent, a nick ping is not', async () => {
    const { runner, adapter, store, notifications } = await online();
    store.conversations.set('room@conf', {
      id: 'room@conf', accountId: 'acc', kind: 'room', address: 'room@conf', name: 'Room', topic: '',
      memberCount: 3, unread: 0, mentions: 0, lastReadId: null, muted: false, notifyLevel: 'mentions',
      isKnownContact: true, updatedAt: 1,
    });
    const roomMsg = (protocolId: string, body: string) => {
      const m = incomingMessage(protocolId, body);
      m.message.conversationId = 'room@conf';
      m.message.senderAddress = 'room@conf/Bea';
      m.message.senderName = 'Bea';
      return m;
    };
    adapter.channel.push(roomMsg('r1', 'just chatting'));
    await tick();
    expect(notifications).toHaveLength(0);
    adapter.channel.push(roomMsg('r2', 'hey Ada can you look'));
    await tick();
    expect(notifications.map((n) => n.body)).toEqual(['hey Ada can you look']);
    void runner;
  });
});

describe('ChatAccountRunner — against the real ChatStore', () => {
  // `FakeStore` above has no foreign keys, so it cannot catch a bug where the caller writes a
  // message before the conversation row exists — which is exactly what happened here. This suite
  // exists to run the same event sequences against the real, migrated, in-memory SQLite store so a
  // constraint violation actually throws instead of being silently absorbed by a fixture.
  it('a brand-new DM contact\'s first message does not violate the chat_messages foreign key', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    ChatStore.upsertAccount(db, account);
    const adapter = new FakeAdapter();
    const { deps } = makeDeps({ adapter, store: makeRunnerStore(db) });
    const runner = new ChatAccountRunner(deps);
    runner.start();
    await tick();
    expect(runner.connState).toBe('online');

    // Before the fix, `ChatStore.upsertMessage` threw "FOREIGN KEY constraint failed" here — a
    // synchronous throw inside `ChatAccountRunner.ingest`'s for-loop, which aborted BEFORE the
    // paired 'conversation' change (queued right after 'message' in the same batch) ever ran, and
    // propagated up into `ChatConnectionManager.pump`'s catch-all, which treats any pump fault as a
    // dropped stream and reconnects — into the exact same first message again: an account could
    // never get past a new contact's first DM.
    adapter.channel.push(incomingMessage('p1', 'hi'));
    await tick();

    expect(runner.connState).toBe('online');
    expect(makeRunnerStore(db).getConversation('bob@example.com')).toMatchObject({
      id: 'bob@example.com',
      kind: 'dm',
    });
  });
});
