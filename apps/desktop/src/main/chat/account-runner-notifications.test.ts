import { describe, it, expect } from 'vitest';
import { tick, incomingMessage, online } from './account-runner.test-kit';

describe('ChatAccountRunner — notifications', () => {
  it('raises a notification for an inbound DM message, titled by the sender', async () => {
    const { adapter, notifications } = await online();
    adapter.channel.push(incomingMessage('m1', 'ping'));
    await tick();
    expect(notifications).toEqual([
      { accountId: 'acc', conversationId: 'bob@example.com', title: 'Bob', body: 'ping' },
    ]);
  });

  it("does not notify for the account's own echo or a redacted message", async () => {
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

  it("does not notify for the account's own room message — matched by occupant nick, not raw address", async () => {
    const { adapter, store, notifications } = await online();
    store.conversations.set('room@conf', {
      id: 'room@conf',
      accountId: 'acc',
      kind: 'room',
      address: 'room@conf',
      name: 'Room',
      topic: '',
      memberCount: 1,
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
      id: 'room@conf',
      accountId: 'acc',
      kind: 'room',
      address: 'room@conf',
      name: 'Room',
      topic: '',
      memberCount: 3,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      mutedUntil: null,
      notifyLevel: 'mentions',
      isKnownContact: true,
      archived: false,
      lastMessage: null,
      updatedAt: 1,
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
