/**
 * Automatic retry after a transfer is interrupted mid-flight.
 *
 * A browser that gives up on the first dropped packet is a browser people stop downloading with; one
 * that retries forever is a browser that hammers a server which is already telling it to stop. So the
 * budget is small, the waits grow, and the decision is a pure function so the policy can be read in
 * one place instead of inferred from a timer.
 */
export const DOWNLOAD_RETRY_BUDGET = 4;
/** First wait. Doubles per attempt: 1s, 2s, 4s, 8s. */
const RETRY_BASE_MS = 1_000;
/** Ceiling, so a long backoff cannot outlive the user's patience or the app's session. */
const RETRY_MAX_MS = 30_000;

export interface DownloadRetryPlan {
  retry: boolean;
  /** Milliseconds to wait before the next attempt. 0 when not retrying. */
  delayMs: number;
  reason: 'ok' | 'budget-exhausted' | 'not-interrupted' | 'user-canceled';
}

/**
 * Whether to retry, and how long to wait first.
 *
 * `attemptsSoFar` counts retries already made for this transfer, not the original attempt. It is held
 * in memory on purpose: a restart is a new session and deserves a fresh budget, and persisting it
 * would make a download that failed four times last week permanently un-retryable today.
 *
 * A user CANCEL is never retried. It is the one interruption that carries an instruction.
 */
export function planDownloadRetry(input: {
  doneState: 'completed' | 'cancelled' | 'interrupted';
  attemptsSoFar: number;
}): DownloadRetryPlan {
  if (input.doneState === 'cancelled') return { retry: false, delayMs: 0, reason: 'user-canceled' };
  if (input.doneState !== 'interrupted') {
    return { retry: false, delayMs: 0, reason: 'not-interrupted' };
  }
  if (input.attemptsSoFar >= DOWNLOAD_RETRY_BUDGET) {
    return { retry: false, delayMs: 0, reason: 'budget-exhausted' };
  }
  const delayMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** input.attemptsSoFar);
  return { retry: true, delayMs, reason: 'ok' };
}
