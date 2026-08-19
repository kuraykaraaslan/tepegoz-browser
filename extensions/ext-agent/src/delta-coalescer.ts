/**
 * Batches streamed model fragments before they reach React state (S8 PR1).
 *
 * A fast provider emits a fragment every few milliseconds. Handing each one straight to `setState`
 * re-renders the whole panel per token — the renderer spends more time laying out text than the model
 * spends producing it, and on a long turn the panel visibly stutters. The fix is not to throttle what
 * arrives (every fragment is still shown) but to *accumulate* and flush on a timer.
 *
 * The window is the tuning knob and it has a floor and a ceiling for different reasons: below ~30ms the
 * batching stops saving renders, and above ~50ms a human starts perceiving the text as arriving in
 * chunks rather than streaming. 40ms sits between them.
 *
 * Written as a plain object with an injected clock rather than a hook, so the batching rule can be
 * tested without a DOM — the flooding this prevents is a real bug, and a bug worth preventing is worth
 * a test.
 */

export const DELTA_FLUSH_MS = 40;

export interface DeltaCoalescer {
  /** Buffer one fragment for a group. */
  push(groupId: string, text: string): void;
  /** Flush everything now — call when a run settles, so no fragment is stranded in the buffer. */
  flush(): void;
  /** Cancel the pending timer. Idempotent; safe in a React cleanup. */
  dispose(): void;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * @param onFlush receives the accumulated text per group, once per window. Groups with nothing buffered
 * are not reported — a flush that changed nothing must not cost a render either.
 */
export function createDeltaCoalescer(
  onFlush: (batch: ReadonlyMap<string, string>) => void,
  windowMs = DELTA_FLUSH_MS,
): DeltaCoalescer {
  let pending = new Map<string, string>();
  let timer: Timer | null = null;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size === 0) return;
    const batch = pending;
    pending = new Map();
    onFlush(batch);
  };

  return {
    push(groupId, text) {
      if (text.length === 0) return;
      pending.set(groupId, (pending.get(groupId) ?? '') + text);
      // One timer for the whole buffer, started by the first fragment of a window and never restarted
      // by later ones. Restarting it per fragment would let a steady stream defer the flush forever —
      // the classic debounce-instead-of-throttle mistake, which on a long turn shows nothing at all.
      timer ??= setTimeout(flush, windowMs);
    },
    flush,
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = new Map();
    },
  };
}
