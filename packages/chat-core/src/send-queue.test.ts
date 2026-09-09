import { describe, it, expect } from 'vitest';
import { OutgoingMessageSchema } from '@tepegoz/shared-types';
import {
  MAX_SEND_ATTEMPTS,
  backoffMs,
  deadSends,
  dueSends,
  enqueueSend,
  markFailed,
  markSending,
  markSent,
  pruneSends,
  type QueuedSend,
} from './send-queue';

const body = OutgoingMessageSchema.parse({ body: 'hi' });

function seed(): QueuedSend[] {
  return enqueueSend([], { id: 's1', accountId: 'a', conversationId: 'c', body, now: 1000 });
}

describe('send-queue', () => {
  it('enqueues once — a duplicate id is ignored (idempotent replay)', () => {
    let q = seed();
    q = enqueueSend(q, { id: 's1', accountId: 'a', conversationId: 'c', body, now: 2000 });
    expect(q).toHaveLength(1);
  });

  it('backoff is capped exponential', () => {
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(4)).toBe(16_000);
    expect(backoffMs(50)).toBe(300_000);
  });

  it('sending increments attempts; sent clears error', () => {
    let q = seed();
    q = markSending(q, 's1', 1100);
    expect(q[0]?.attempts).toBe(1);
    q = markSent(q, 's1', 1200);
    expect(q[0]?.status).toBe('sent');
    expect(q[0]?.lastError).toBeNull();
  });

  it('a failed entry is not due until its backoff elapses', () => {
    let q = seed();
    q = markSending(q, 's1', 1100);
    q = markFailed(q, 's1', 'network down', 1200);
    expect(dueSends(q, 1200)).toHaveLength(0);
    expect(dueSends(q, 1200 + backoffMs(1))).toHaveLength(1);
  });

  it('stops being due after MAX_SEND_ATTEMPTS and shows up as dead', () => {
    let q = seed();
    for (let i = 0; i < MAX_SEND_ATTEMPTS; i += 1) {
      q = markSending(q, 's1', 2000 + i);
      q = markFailed(q, 's1', 'nope', 2000 + i);
    }
    expect(dueSends(q, 10_000_000)).toHaveLength(0);
    expect(deadSends(q)).toHaveLength(1);
  });

  it('an in-flight (sending) entry is not re-picked as due', () => {
    let q = seed();
    q = markSending(q, 's1', 1100);
    expect(dueSends(q, 9_999_999)).toHaveLength(0);
  });

  it('prune drops delivered entries only', () => {
    let q = seed();
    q = enqueueSend(q, { id: 's2', accountId: 'a', conversationId: 'c', body, now: 1000 });
    q = markSent(q, 's1', 1200);
    expect(pruneSends(q).map((x) => x.id)).toEqual(['s2']);
  });
});
