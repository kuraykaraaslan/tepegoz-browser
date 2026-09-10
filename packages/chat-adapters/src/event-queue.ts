import type { ChatEvent } from './adapter';

/**
 * Every adapter session buffers events between its wire reader and the `events()` async-iterable.
 * That buffer must be bounded: a consumer that stops draining (a slow DB write, a paused pump, a
 * blocked renderer) would otherwise let the buffer — and process memory — grow without limit while
 * the wire keeps delivering (an IRC channel firehose, an XMPP MAM burst, a Matrix `/sync` loop).
 *
 * Policy: at the cap the oldest events are dropped (`dropped` tallies them) and the session is
 * flagged to emit one out-of-band `error` event on the next dequeue so `ChatAccountState`
 * downstream surfaces a "resync needed"; the flag re-arms once the queue fully drains. The gap
 * notice is deliberately NOT stored in the queue — a constantly-overflowing FIFO cannot hold a
 * single sentinel reliably, and `dropped` is the durable signal.
 */

export const MAX_QUEUED_EVENTS = 4_096;

/** Per-session mutable state the bound reads and writes. */
export interface EventQueueState {
  /** Total events discarded because the consumer was not draining. */
  dropped: number;
  /** One-shot gap-notice lifecycle: none → pending (overflow happened) → sent → none (on drain). */
  gap: 'none' | 'pending' | 'sent';
}

export function newEventQueueState(): EventQueueState {
  return { dropped: 0, gap: 'none' };
}

export function overflowGapEvent(): ChatEvent {
  return {
    type: 'error',
    scope: 'account',
    conversationId: null,
    message: 'event backlog overflowed — some events were dropped; a resync is needed',
  };
}

/**
 * Trim `queue` to `max` in place (dropping the oldest), tallying `state.dropped`, and arm the
 * one-shot gap notice the first time the cap is exceeded. Call right after appending an event that
 * was not handed straight to a waiter.
 */
export function boundEventQueue(
  queue: ChatEvent[],
  state: EventQueueState,
  max = MAX_QUEUED_EVENTS,
): void {
  if (queue.length <= max) return;
  const excess = queue.length - max;
  queue.splice(0, excess);
  state.dropped += excess;
  if (state.gap === 'none') state.gap = 'pending';
}

/**
 * If a gap notice is pending, consume it and return the synthetic `error` event to deliver before
 * the next queued item; otherwise `null`. Call at the head of every dequeue.
 */
export function takeGapNotice(state: EventQueueState): ChatEvent | null {
  if (state.gap !== 'pending') return null;
  state.gap = 'sent';
  return overflowGapEvent();
}

/** Re-arm the one-shot gap notice once the queue has fully drained. Call after every dequeue. */
export function rearmGapNotice(queue: readonly ChatEvent[], state: EventQueueState): void {
  if (queue.length === 0 && state.gap === 'sent') state.gap = 'none';
}
