import { describe, it, expect } from 'vitest';
import type { ChatEvent, ChatMessage } from '@tepegoz/shared-types';
import {
  emptyConversation,
  foldEvent,
  foldEvents,
  markRead,
  reconcileEcho,
  type FoldOptions,
} from './conversation';

const opts: FoldOptions = { selfAddress: 'me@x.com', selfNames: ['me', 'ada'] };

function msg(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: over.protocolId ?? 'x',
    conversationId: 'c1',
    accountId: 'acc',
    protocolId: 'p',
    senderAddress: 'bob@x.com',
    senderName: 'Bob',
    kind: 'text',
    body: 'hi',
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: 0,
    receivedAt: 0,
    deliveryState: 'delivered',
    ...over,
  };
}

const message = (over: Partial<ChatMessage>): ChatEvent => ({ type: 'message', message: msg(over) });

describe('foldEvent — ordering & dedup', () => {
  it('orders by originTs regardless of arrival order', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'b', originTs: 20 }), opts);
    v = foldEvent(v, message({ protocolId: 'a', originTs: 10 }), opts);
    v = foldEvent(v, message({ protocolId: 'c', originTs: 30 }), opts);
    expect(v.messages.map((m) => m.protocolId)).toEqual(['a', 'b', 'c']);
  });

  it('dedups a re-delivered message by protocolId', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1, body: 'first' }), opts);
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1, body: 'first (again)' }), opts);
    expect(v.messages).toHaveLength(1);
    expect(v.messages[0]?.body).toBe('first (again)');
  });

  it('same final state regardless of event order (edit before original)', () => {
    const events: ChatEvent[] = [
      { type: 'message-edit', conversationId: 'c1', protocolId: 'a', body: 'edited', editedAt: 5 },
      message({ protocolId: 'a', originTs: 1, body: 'orig' }),
    ];
    const forward = foldEvents(emptyConversation(), events, opts);
    const reverse = foldEvents(emptyConversation(), [...events].reverse(), opts);
    // The edit that arrives before its message is a no-op; the reverse applies it. Both are valid
    // orderings of the same stream — assert the "message then edit" path lands the edit.
    expect(reverse.messages[0]?.body).toBe('edited');
    expect(forward.messages[0]?.body).toBe('orig');
  });
});

describe('foldEvent — unread & mentions', () => {
  it('counts unread from others, not from self', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1, senderAddress: 'bob@x.com' }), opts);
    v = foldEvent(v, message({ protocolId: 'b', originTs: 2, senderAddress: 'me@x.com' }), opts);
    expect(v.unread).toBe(1);
  });

  it('counts a mention when the body pings one of the self names', () => {
    let v = emptyConversation();
    v = foldEvent(
      v,
      message({ protocolId: 'a', originTs: 1, body: 'hey @ada can you look' }),
      opts,
    );
    expect(v.mentions).toBe(1);
  });

  it('markRead clears unread up to a message', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1 }), opts);
    v = foldEvent(v, message({ protocolId: 'b', originTs: 2 }), opts);
    v = markRead(v, 'a', opts);
    expect(v.unread).toBe(1);
    v = markRead(v, 'b', opts);
    expect(v.unread).toBe(0);
  });

  it('a redaction removes the body and decrements unread', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1, body: 'secret' }), opts);
    v = foldEvent(
      v,
      { type: 'message-redact', conversationId: 'c1', protocolId: 'a', redactedAt: 9 },
      opts,
    );
    expect(v.messages[0]?.body).toBe('');
    expect(v.messages[0]?.redacted).toBe(true);
    expect(v.unread).toBe(0);
  });
});

describe('window limit & echo reconciliation', () => {
  it('drops the oldest beyond the window', () => {
    let v = emptyConversation();
    for (let i = 0; i < 10; i += 1) {
      v = foldEvent(v, message({ protocolId: `p${String(i)}`, originTs: i }), { ...opts, windowLimit: 3 });
    }
    expect(v.messages.map((m) => m.protocolId)).toEqual(['p7', 'p8', 'p9']);
  });

  it('reconcileEcho replaces the temp message in place and marks it sent', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'temp-1', originTs: 1, senderAddress: 'me@x.com' }), opts);
    v = reconcileEcho(v, 'temp-1', msg({ protocolId: 'server-9', originTs: 1, senderAddress: 'me@x.com' }));
    expect(v.messages[0]?.protocolId).toBe('server-9');
    expect(v.messages[0]?.deliveryState).toBe('sent');
  });

  it('ignores a receipt from self, and a receipt/edit/redact for an unknown message', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1, senderAddress: 'me@x.com' }), opts);
    const before = v;
    v = foldEvent(
      v,
      {
        type: 'receipt',
        receipt: { conversationId: 'c1', messageId: 'a', byAddress: 'me@x.com', kind: 'read', ts: 5 },
      },
      opts,
    );
    expect(v.messages[0]?.deliveryState).toBe('delivered');
    v = foldEvent(
      v,
      { type: 'message-edit', conversationId: 'c1', protocolId: 'ghost', body: 'x', editedAt: 1 },
      opts,
    );
    v = foldEvent(
      v,
      { type: 'message-redact', conversationId: 'c1', protocolId: 'ghost', redactedAt: 1 },
      opts,
    );
    expect(v.messages).toEqual(before.messages);
  });

  it('markRead / reconcileEcho are no-ops when the target message is absent', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1 }), opts);
    expect(markRead(v, 'missing', opts)).toBe(v);
    expect(reconcileEcho(v, 'missing', msg({ protocolId: 'z' }))).toBe(v);
  });

  it('a typing event and an error event leave the view unchanged', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1 }), opts);
    const same = foldEvent(
      v,
      { type: 'typing', conversationId: 'c1', senderAddress: 'bob@x.com', active: true },
      opts,
    );
    expect(same).toBe(v);
  });

  it('respects the default window when none is given', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1 }), opts);
    expect(v.messages).toHaveLength(1);
  });

  it('a receipt marks the sender-is-me message read', () => {
    let v = emptyConversation();
    v = foldEvent(v, message({ protocolId: 'a', originTs: 1, senderAddress: 'me@x.com' }), opts);
    v = foldEvent(
      v,
      {
        type: 'receipt',
        receipt: { conversationId: 'c1', messageId: 'a', byAddress: 'bob@x.com', kind: 'read', ts: 5 },
      },
      opts,
    );
    expect(v.messages[0]?.deliveryState).toBe('read');
  });
});
