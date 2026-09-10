import { describe, expect, it } from 'vitest';
import type { ChatEvent } from './adapter';
import {
  MAX_QUEUED_EVENTS,
  boundEventQueue,
  newEventQueueState,
  overflowGapEvent,
  rearmGapNotice,
  takeGapNotice,
} from './event-queue';

const msg = (i: number): ChatEvent => ({
  type: 'message',
  message: {
    id: `id-${String(i)}`,
    conversationId: 'c',
    accountId: 'acc',
    protocolId: `p${String(i)}`,
    senderAddress: '@bob:x',
    senderName: 'Bob',
    kind: 'text',
    body: String(i),
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: i,
    receivedAt: i,
    deliveryState: 'delivered',
  },
});

describe('boundEventQueue', () => {
  it('is a no-op below the cap', () => {
    const q = [msg(0), msg(1)];
    const s = newEventQueueState();
    boundEventQueue(q, s, 8);
    expect(q).toHaveLength(2);
    expect(s.dropped).toBe(0);
    expect(s.gap).toBe('none');
  });

  it('never exceeds the cap and drops exactly the oldest overflow', () => {
    const q: ChatEvent[] = [];
    const s = newEventQueueState();
    for (let i = 0; i < 13; i += 1) {
      q.push(msg(i));
      boundEventQueue(q, s, 8);
      expect(q.length).toBeLessThanOrEqual(8); // the memory bound, every step
    }
    expect(q).toHaveLength(8);
    expect(s.dropped).toBe(5);
    expect(s.gap).toBe('pending');
    // no gap sentinel is stored in the queue
    expect(q.every((e) => e.type === 'message')).toBe(true);
    // the survivors are the newest run
    const bodies = q.map((e) => Number((e as Extract<ChatEvent, { type: 'message' }>).message.body));
    expect(Math.min(...bodies)).toBe(5);
  });

  it('takeGapNotice yields the sentinel once, then not again until re-armed', () => {
    const q: ChatEvent[] = [];
    const s = newEventQueueState();
    for (let i = 0; i < 20; i += 1) {
      q.push(msg(i));
      boundEventQueue(q, s, 4);
    }
    expect(takeGapNotice(s)).toMatchObject({ type: 'error', scope: 'account' });
    expect(takeGapNotice(s)).toBeNull();

    // drain fully → re-arm → overflow again → a fresh notice
    while (q.length > 0) {
      q.shift();
      rearmGapNotice(q, s);
    }
    expect(s.gap).toBe('none');
    for (let i = 0; i < 20; i += 1) {
      q.push(msg(i));
      boundEventQueue(q, s, 4);
    }
    expect(takeGapNotice(s)).not.toBeNull();
    expect(s.dropped).toBe(32);
  });

  it('rearmGapNotice only clears a sent flag, and only on an empty queue', () => {
    const s = newEventQueueState();
    s.gap = 'pending';
    rearmGapNotice([], s);
    expect(s.gap).toBe('pending'); // pending is not cleared — it still owes delivery
    s.gap = 'sent';
    rearmGapNotice([msg(1)], s);
    expect(s.gap).toBe('sent'); // non-empty queue
    rearmGapNotice([], s);
    expect(s.gap).toBe('none');
  });

  it('the default cap is 4096 and the sentinel validates as an account error', () => {
    expect(MAX_QUEUED_EVENTS).toBe(4_096);
    expect(overflowGapEvent()).toMatchObject({ type: 'error', scope: 'account', conversationId: null });
  });
});
