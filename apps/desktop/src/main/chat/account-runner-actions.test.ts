import { describe, it, expect, vi } from 'vitest';
import { tick, harness, incomingMessage, online } from './account-runner.test-kit';

describe('ChatAccountRunner — actions', () => {
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

  it('history merges local + live, LOCAL winning on a duplicate protocol id — a fresh live refetch reconstructs bare messages with no reactions/edits/redactions, so it must never clobber what local storage already knows', async () => {
    // Regression: a fresh history() call used to let the live refetch win, so a message the user had
    // already reacted to (or that had been edited/redacted) came back with its reactions/edit/
    // redaction silently wiped, both in this return value AND in the DB (via the seedHistory ->
    // upsertMessage write below) — reactions visibly "disappeared" on every app restart that
    // re-synced a conversation's history.
    const { runner, adapter, store } = await online();
    store.upsertMessage({
      ...incomingMessage('h1', 'stale local copy').message,
      reactions: [{ emoji: '👍', count: 1, me: true }],
    });
    adapter.historyPages = [
      { ...incomingMessage('h1', 'fresh from server').message, originTs: 500 },
    ];
    const page = await runner.history('bob@example.com', null);
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.body).toBe('stale local copy');
    expect(page.messages[0]?.reactions).toEqual([{ emoji: '👍', count: 1, me: true }]);
    // The DB row is untouched too — no re-persist of the reaction-less live reconstruction.
    expect(store.messages.find((m) => m.protocolId === 'h1')?.reactions).toEqual([
      { emoji: '👍', count: 1, me: true },
    ]);
  });

  it('history still picks up a genuinely new message the live fetch has but local does not', async () => {
    const { runner, adapter, store } = await online();
    store.upsertMessage(incomingMessage('h1', 'already known').message);
    adapter.historyPages = [
      incomingMessage('h1', 'already known').message,
      { ...incomingMessage('h2', 'brand new from server').message, originTs: 600 },
    ];
    const page = await runner.history('bob@example.com', null);
    expect(page.messages.map((m) => m.protocolId).sort()).toEqual(['h1', 'h2']);
    expect(store.messages.find((m) => m.protocolId === 'h2')?.body).toBe('brand new from server');
  });

  it('roster persists every contact', async () => {
    const { runner, adapter, store } = await online();
    adapter.rosterContacts = [
      {
        id: 'acc:c@x',
        accountId: 'acc',
        address: 'c@x',
        name: 'C',
        groups: [],
        presence: 'offline',
        statusText: '',
        subscription: 'both',
        blocked: false,
      },
    ];
    expect(await runner.roster()).toHaveLength(1);
    expect(store.contacts).toHaveLength(1);
  });

  it('discoverRooms passes through the adapter; joinRoom persists the room conversation', async () => {
    const { runner, adapter, store } = await online();
    expect(await runner.discoverRooms('conf.example')).toEqual([
      {
        jid: 'g@conf',
        name: 'G',
        description: null,
        occupants: 2,
        passwordProtected: false,
        membersOnly: false,
      },
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
      id: '#c',
      accountId: 'acc',
      kind: 'room',
      address: '#c',
      name: '#c',
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
    adapter.channel.push({
      type: 'room-topic',
      conversationId: '#c',
      topic: 'Release week',
      setBy: 'op',
      ts: null,
    });
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
    expect(store.getConversation('!room:example')).toMatchObject({
      id: '!room:example',
      kind: 'room',
    });
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
    expect(store.getConversation('bob@example.com')).toMatchObject({
      id: 'bob@example.com',
      kind: 'dm',
    });
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
    // Deliberately drop the optional methods.
    (adapter as { discoverRooms?: unknown }).discoverRooms = undefined;
    (adapter as { joinRoom?: unknown }).joinRoom = undefined;
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

  it('setMuted(false) clears a lingering timed mute too — the two share one "is muted" bit', async () => {
    const { runner, store } = await online();
    await runner.muteFor('room@conf', 3_600_000);
    expect(store.conversations.get('room@conf')?.mutedUntil).toBe(1_000 + 3_600_000);
    await runner.setMuted('room@conf', false);
    expect(store.conversations.get('room@conf')).toMatchObject({ muted: false, mutedUntil: null });
  });

  it('muteFor sets an expiry for a duration, or the forever flag for null — never both at once', async () => {
    const { runner, store } = await online();
    await runner.muteFor('room@conf', 3_600_000);
    expect(store.conversations.get('room@conf')).toMatchObject({
      muted: false,
      mutedUntil: 1_000 + 3_600_000,
    });
    await runner.muteFor('room@conf', null);
    expect(store.conversations.get('room@conf')).toMatchObject({ muted: true, mutedUntil: null });
  });

  it('setArchived patches the stored conversation without touching anything else', async () => {
    const { runner, store } = await online();
    await runner.setMuted('room@conf', true);
    await runner.setArchived('room@conf', true);
    expect(store.conversations.get('room@conf')).toMatchObject({ archived: true, muted: true });
    await runner.setArchived('room@conf', false);
    expect(store.conversations.get('room@conf')).toMatchObject({ archived: false, muted: true });
  });

  it('blockContact 501s without adapter support; otherwise delegates and persists blocked via setContactBlocked (not upsertContact)', async () => {
    const { runner, adapter, store } = await online();
    store.upsertContact({
      id: 'acc:bob@example.com',
      accountId: 'acc',
      address: 'bob@example.com',
      name: 'Bob',
      groups: [],
      presence: 'online',
      statusText: '',
      subscription: 'both',
      blocked: false,
    });
    await expect(runner.blockContact('bob@example.com', true)).rejects.toThrow(/blocking/);

    const blockContact = vi.fn(() => Promise.resolve());
    const unblockContact = vi.fn(() => Promise.resolve());
    (adapter as unknown as { blockContact: typeof blockContact }).blockContact = blockContact;
    (adapter as unknown as { unblockContact: typeof unblockContact }).unblockContact =
      unblockContact;

    await runner.blockContact('bob@example.com', true);
    expect(blockContact).toHaveBeenCalledWith(expect.anything(), 'bob@example.com');
    expect(store.contacts.find((c) => c.address === 'bob@example.com')?.blocked).toBe(true);

    await runner.blockContact('bob@example.com', false);
    expect(unblockContact).toHaveBeenCalledWith(expect.anything(), 'bob@example.com');
    expect(store.contacts.find((c) => c.address === 'bob@example.com')?.blocked).toBe(false);
  });

  it('editMessage 501s without adapter support; otherwise delegates with a write-only OutgoingMessage', async () => {
    const { runner, adapter } = await online();
    await expect(runner.editMessage('room@conf', 'm1', 'fixed')).rejects.toThrow(
      /editing messages/,
    );

    const editMessage = vi.fn(() => Promise.resolve());
    (adapter as unknown as { editMessage: typeof editMessage }).editMessage = editMessage;
    await runner.editMessage('room@conf', 'm1', 'fixed');
    expect(editMessage).toHaveBeenCalledWith(expect.anything(), 'room@conf', 'm1', {
      body: 'fixed',
      replyToId: null,
      mediaPath: null,
    });
  });

  it('a roster-remove event is not persisted as a contact', async () => {
    const { adapter, store } = await online();
    const contact = {
      id: 'acc:c@x',
      accountId: 'acc',
      address: 'c@x',
      name: '',
      groups: [],
      presence: 'offline' as const,
      statusText: '',
      subscription: 'none' as const,
    };
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
});
