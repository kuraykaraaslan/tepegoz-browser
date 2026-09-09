import { describe, expect, it } from 'vitest';
import type { ChatStateChange } from '@tepegoz/chat-core';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import {
  applyChatChange,
  applyChatChanges,
  emptyChatClientState,
  seedConversations,
  seedHistory,
  seedRoster,
} from './chat-store';

function conv(over: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'c1',
    accountId: 'work',
    kind: 'dm',
    address: 'bob@x.example',
    name: 'Bob',
    topic: '',
    memberCount: 2,
    unread: 0,
    mentions: 0,
    lastReadId: null,
    muted: false,
    isKnownContact: true,
    updatedAt: 100,
    ...over,
  };
}

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    accountId: 'work',
    protocolId: 'p1',
    senderAddress: 'bob@x.example',
    senderName: 'Bob',
    kind: 'text',
    body: 'hi',
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: 200,
    receivedAt: 200,
    deliveryState: 'delivered',
    ...over,
  };
}

function contact(over: Partial<ChatContact> = {}): ChatContact {
  return {
    id: 'work:bob@x.example',
    accountId: 'work',
    address: 'bob@x.example',
    name: 'Bob',
    groups: [],
    presence: 'offline',
    statusText: '',
    subscription: 'both',
    ...over,
  };
}

describe('seeding', () => {
  it('indexes conversations and roster by id', () => {
    let state = seedConversations(emptyChatClientState(), [conv(), conv({ id: 'c2' })]);
    state = seedRoster(state, [contact()]);
    expect(Object.keys(state.conversations)).toEqual(['c1', 'c2']);
    expect(state.roster['work:bob@x.example']?.name).toBe('Bob');
  });

  it('seedHistory merges + orders by (originTs, receivedAt, protocolId), dedup on protocolId', () => {
    let state = seedHistory(emptyChatClientState(), 'c1', [
      msg({ protocolId: 'b', originTs: 20 }),
      msg({ protocolId: 'a', originTs: 10 }),
    ]);
    state = seedHistory(state, 'c1', [msg({ protocolId: 'a', originTs: 10, body: 'edited' })]);
    const list = state.messages.c1 ?? [];
    expect(list.map((m) => m.protocolId)).toEqual(['a', 'b']);
    expect(list[0]?.body).toBe('hi'); // existing wins on re-seed
  });
});

describe('applyChatChange', () => {
  const opened = () => seedHistory(seedConversations(emptyChatClientState(), [conv()]), 'c1', []);

  it('appends a message to an open conversation and bumps its updatedAt', () => {
    const state = applyChatChange(opened(), {
      kind: 'message',
      conversationId: 'c1',
      message: msg({ protocolId: 'p9', receivedAt: 500 }),
    } satisfies ChatStateChange);
    expect((state.messages.c1 ?? []).map((m) => m.protocolId)).toEqual(['p9']);
    expect(state.conversations.c1?.updatedAt).toBe(500);
  });

  it('a message change for an existing protocolId replaces it in place', () => {
    let state = seedHistory(opened(), 'c1', [msg({ protocolId: 'p1', body: 'first', receivedAt: 200 })]);
    state = applyChatChange(state, {
      kind: 'message',
      conversationId: 'c1',
      message: msg({ protocolId: 'p1', body: 'reconciled', receivedAt: 200 }),
    });
    expect(state.messages.c1).toHaveLength(1);
    expect(state.messages.c1?.[0]?.body).toBe('reconciled');
  });

  it('orders two messages with identical timestamps by protocolId', () => {
    const state = applyChatChanges(opened(), [
      { kind: 'message', conversationId: 'c1', message: msg({ protocolId: 'zeta', originTs: 5, receivedAt: 5 }) },
      { kind: 'message', conversationId: 'c1', message: msg({ protocolId: 'alpha', originTs: 5, receivedAt: 5 }) },
    ]);
    expect((state.messages.c1 ?? []).map((m) => m.protocolId)).toEqual(['alpha', 'zeta']);
  });

  it('ignores a message for a conversation that was never opened (but still bumps the row)', () => {
    const state = applyChatChange(seedConversations(emptyChatClientState(), [conv()]), {
      kind: 'message',
      conversationId: 'c1',
      message: msg({ receivedAt: 700 }),
    });
    expect(state.messages.c1).toBeUndefined();
    expect(state.conversations.c1?.updatedAt).toBe(700);
  });

  it('message-updated replaces or removes by protocolId', () => {
    let state = seedHistory(opened(), 'c1', [msg({ protocolId: 'p1' })]);
    state = applyChatChange(state, {
      kind: 'message-updated',
      conversationId: 'c1',
      protocolId: 'p1',
      message: msg({ protocolId: 'p1', body: 'fixed', editedAt: 9 }),
    });
    expect(state.messages.c1?.[0]?.body).toBe('fixed');
    state = applyChatChange(state, {
      kind: 'message-updated',
      conversationId: 'c1',
      protocolId: 'p1',
      message: null,
    });
    expect(state.messages.c1).toEqual([]);
  });

  it('conversation change patches counts only for a known row', () => {
    const state = applyChatChange(opened(), {
      kind: 'conversation',
      conversationId: 'c1',
      unread: 3,
      mentions: 1,
      lastReadId: 'm5',
    });
    expect(state.conversations.c1).toMatchObject({ unread: 3, mentions: 1, lastReadId: 'm5' });
    expect(applyChatChange(opened(), {
      kind: 'conversation',
      conversationId: 'ghost',
      unread: 1,
      mentions: 0,
      lastReadId: null,
    }).conversations.ghost).toBeUndefined();
  });

  it('roster add / remove', () => {
    let state = applyChatChange(emptyChatClientState(), {
      kind: 'roster',
      contact: contact(),
      removed: false,
    });
    expect(state.roster['work:bob@x.example']).toBeDefined();
    state = applyChatChange(state, { kind: 'roster', contact: contact(), removed: true });
    expect(state.roster['work:bob@x.example']).toBeUndefined();
  });

  it('presence updates every roster contact at that address', () => {
    const state = applyChatChange(seedRoster(emptyChatClientState(), [contact()]), {
      kind: 'presence',
      address: 'bob@x.example',
      effective: { presence: 'online', statusText: 'here' },
    });
    expect(state.roster['work:bob@x.example']).toMatchObject({ presence: 'online', statusText: 'here' });
  });

  it('typing toggles the per-conversation set idempotently', () => {
    let state = applyChatChange(opened(), {
      kind: 'typing',
      conversationId: 'c1',
      senderAddress: 'bob@x.example',
      active: true,
    });
    expect(state.typing.c1).toEqual(['bob@x.example']);
    const same = applyChatChange(state, {
      kind: 'typing',
      conversationId: 'c1',
      senderAddress: 'bob@x.example',
      active: true,
    });
    expect(same).toBe(state); // no-op returns the same reference
    state = applyChatChange(state, {
      kind: 'typing',
      conversationId: 'c1',
      senderAddress: 'bob@x.example',
      active: false,
    });
    expect(state.typing.c1).toEqual([]);
  });

  it('dropped is a no-op', () => {
    const s = opened();
    expect(applyChatChange(s, { kind: 'dropped', reason: 'invalid' })).toBe(s);
  });

  it('applyChatChanges folds a batch', () => {
    const state = applyChatChanges(opened(), [
      { kind: 'message', conversationId: 'c1', message: msg({ protocolId: 'a', receivedAt: 300 }) },
      { kind: 'message', conversationId: 'c1', message: msg({ protocolId: 'b', receivedAt: 400 }) },
    ]);
    expect((state.messages.c1 ?? []).map((m) => m.protocolId)).toEqual(['a', 'b']);
    expect(state.conversations.c1?.updatedAt).toBe(400);
  });
});
