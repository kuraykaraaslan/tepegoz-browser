import { describe, it, expect } from 'vitest';
import { openDatabase, migrate, ChatStore } from '@tepegoz/persistence';
import { ChatAccountRunner } from './account-runner';
import { makeRunnerStore } from './chat-store-adapter';
import {
  tick,
  FakeAdapter,
  FakeStore,
  account,
  makeDeps,
  harness,
  incomingMessage,
} from './account-runner.test-kit';

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

  it('seeds the persisted read marker on construction, so a reconnect replay of already-read messages does not mark them unread again', async () => {
    // Simulates what a real restart looks like: the DB already has this conversation, read up
    // through 'm2' in a PREVIOUS session — but the ChatAccountState this new ChatAccountRunner
    // constructs is blank until it seeds from the store.
    const adapter = new FakeAdapter();
    const store = new FakeStore();
    store.conversations.set('bob@example.com', {
      id: 'bob@example.com',
      accountId: 'acc',
      kind: 'dm',
      address: 'bob@example.com',
      name: '',
      topic: '',
      memberCount: 2,
      unread: 0,
      mentions: 0,
      lastReadId: 'm2',
      muted: false,
      mutedUntil: null,
      notifyLevel: 'all',
      isKnownContact: true,
      archived: false,
      lastMessage: null,
      updatedAt: 1,
    });
    const { deps } = makeDeps({ adapter, store });
    const runner = new ChatAccountRunner(deps);
    runner.start();
    await tick();

    // A MUC-rejoin / MAM-catch-up style replay: the two already-read messages come back, then one
    // genuinely new one.
    adapter.channel.push(incomingMessage('m1', 'old'));
    adapter.channel.push(incomingMessage('m2', 'also old'));
    adapter.channel.push(incomingMessage('m3', 'actually new'));
    await tick();

    expect(store.conversations.get('bob@example.com')?.unread).toBe(1);
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
    adapter.channel.push({
      type: 'message-edit',
      conversationId: 'bob@example.com',
      protocolId: 'm1',
      body: 'fixed',
      editedAt: 9,
    });
    await tick();
    expect(store.messages[0]?.body).toBe('fixed');
    adapter.channel.push({
      type: 'message-redact',
      conversationId: 'bob@example.com',
      protocolId: 'm1',
      redactedAt: 10,
    });
    await tick();
    expect(store.redacted).toEqual([['bob@example.com', 'm1']]);
  });

  it('keeps the conversation list preview (lastMessage) current: new message, edit, then redaction', async () => {
    const { runner, adapter, store } = harness();
    runner.start();
    await tick();
    adapter.channel.push(incomingMessage('m1', 'hello'));
    await tick();
    expect(store.conversations.get('bob@example.com')?.lastMessage).toMatchObject({
      protocolId: 'm1',
      body: 'hello',
      redacted: false,
    });

    // A newer message advances the preview.
    adapter.channel.push({
      ...incomingMessage('m2', 'newer'),
      message: { ...incomingMessage('m2', 'newer').message, originTs: 600 },
    });
    await tick();
    expect(store.conversations.get('bob@example.com')?.lastMessage?.protocolId).toBe('m2');

    // Editing the CURRENT last message refreshes its body in place.
    adapter.channel.push({
      type: 'message-edit',
      conversationId: 'bob@example.com',
      protocolId: 'm2',
      body: 'fixed',
      editedAt: 9,
    });
    await tick();
    expect(store.conversations.get('bob@example.com')?.lastMessage?.body).toBe('fixed');

    // Editing an OLDER message (not the current preview) must not resurrect it as the preview.
    adapter.channel.push({
      type: 'message-edit',
      conversationId: 'bob@example.com',
      protocolId: 'm1',
      body: 'edited old one',
      editedAt: 9,
    });
    await tick();
    expect(store.conversations.get('bob@example.com')?.lastMessage?.protocolId).toBe('m2');

    // Redacting the CURRENT preview message clears its body and marks it redacted.
    adapter.channel.push({
      type: 'message-redact',
      conversationId: 'bob@example.com',
      protocolId: 'm2',
      redactedAt: 10,
    });
    await tick();
    expect(store.conversations.get('bob@example.com')?.lastMessage).toMatchObject({
      protocolId: 'm2',
      body: '',
      redacted: true,
    });
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
      mutedUntil: null,
      notifyLevel: 'all',
      isKnownContact: true,
      archived: false,
      lastMessage: null,
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
      mutedUntil: null,
      notifyLevel: 'all',
      isKnownContact: true,
      archived: false,
      lastMessage: null,
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
      mutedUntil: null,
      notifyLevel: 'all',
      isKnownContact: true,
      archived: false,
      lastMessage: null,
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
      mutedUntil: null,
      notifyLevel: 'all',
      isKnownContact: true,
      archived: false,
      lastMessage: null,
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

describe('ChatAccountRunner — against the real ChatStore', () => {
  // `FakeStore` above has no foreign keys, so it cannot catch a bug where the caller writes a
  // message before the conversation row exists — which is exactly what happened here. This suite
  // exists to run the same event sequences against the real, migrated, in-memory SQLite store so a
  // constraint violation actually throws instead of being silently absorbed by a fixture.
  it("a brand-new DM contact's first message does not violate the chat_messages foreign key", async () => {
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
