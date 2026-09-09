import type { OutgoingMessage } from '@tepegoz/shared-types';

/**
 * The offline send queue — pure. The host (`ChatService`) owns the timer and the socket; this owns
 * *what to send next and when*. Every entry carries an idempotent `id` so a replay after a reconnect
 * cannot double-send.
 */

export const CHAT_SEND_STATES = ['queued', 'sending', 'sent', 'failed'] as const;
export type ChatSendState = (typeof CHAT_SEND_STATES)[number];

export interface QueuedSend {
  id: string;
  accountId: string;
  conversationId: string;
  body: OutgoingMessage;
  status: ChatSendState;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  /** Do not retry before this time (backoff after a failure). */
  retryAfter: number;
}

const MAX_BACKOFF_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 2_000;
/** Give up (leave `failed`, stop auto-retrying) after this many attempts. */
export const MAX_SEND_ATTEMPTS = 8;

/** Capped exponential backoff: 2s, 4s, 8s … ≤ 5min. */
export function backoffMs(attempts: number): number {
  const n = Math.max(1, Math.trunc(attempts));
  return Math.min(BASE_BACKOFF_MS * 2 ** (n - 1), MAX_BACKOFF_MS);
}

export function enqueueSend(
  queue: readonly QueuedSend[],
  input: {
    id: string;
    accountId: string;
    conversationId: string;
    body: OutgoingMessage;
    now: number;
  },
): QueuedSend[] {
  if (queue.some((q) => q.id === input.id)) return [...queue];
  return [
    ...queue,
    {
      id: input.id,
      accountId: input.accountId,
      conversationId: input.conversationId,
      body: input.body,
      status: 'queued',
      attempts: 0,
      lastError: null,
      createdAt: input.now,
      updatedAt: input.now,
      retryAfter: 0,
    },
  ];
}

function patch(
  queue: readonly QueuedSend[],
  id: string,
  fn: (item: QueuedSend) => QueuedSend,
): QueuedSend[] {
  return queue.map((item) => (item.id === id ? fn(item) : item));
}

export function markSending(queue: readonly QueuedSend[], id: string, now: number): QueuedSend[] {
  return patch(queue, id, (item) => ({
    ...item,
    status: 'sending',
    attempts: item.attempts + 1,
    updatedAt: now,
  }));
}

export function markSent(queue: readonly QueuedSend[], id: string, now: number): QueuedSend[] {
  return patch(queue, id, (item) => ({ ...item, status: 'sent', lastError: null, updatedAt: now }));
}

export function markFailed(
  queue: readonly QueuedSend[],
  id: string,
  error: string,
  now: number,
): QueuedSend[] {
  return patch(queue, id, (item) => ({
    ...item,
    status: 'failed',
    lastError: error.slice(0, 2048),
    updatedAt: now,
    retryAfter: now + backoffMs(item.attempts),
  }));
}

/** Entries ready to send now: `queued`, or `failed` whose backoff has elapsed and which have
 *  attempts left. Oldest first. */
export function dueSends(queue: readonly QueuedSend[], now: number): QueuedSend[] {
  return queue
    .filter((item) => {
      if (item.status === 'queued') return true;
      if (item.status === 'failed') {
        return item.attempts < MAX_SEND_ATTEMPTS && now >= item.retryAfter;
      }
      return false;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Drop delivered (`sent`) entries and permanently-failed ones the caller has surfaced. */
export function pruneSends(queue: readonly QueuedSend[]): QueuedSend[] {
  return queue.filter((item) => item.status !== 'sent');
}

/** A `failed` entry that has exhausted its attempts — the UI shows these with a manual "retry" /
 *  "discard" affordance. */
export function deadSends(queue: readonly QueuedSend[]): QueuedSend[] {
  return queue.filter((item) => item.status === 'failed' && item.attempts >= MAX_SEND_ATTEMPTS);
}
