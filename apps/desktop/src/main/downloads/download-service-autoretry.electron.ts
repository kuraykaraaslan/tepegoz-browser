import { planDownloadRetry } from '@tepegoz/downloads';
import { Logger } from '@tepegoz/libs';
import { patch, type DownloadState } from './download-service-store.electron';
import { resumeInterrupted } from './download-service-resume.electron';

/**
 * Retrying a transfer the network dropped, while the app is running.
 *
 * Deliberately narrow. It fires only for `interrupted` — the state Chromium reports when the transfer
 * died on its own — never for a user cancel, which is the one interruption that carries an
 * instruction. And it goes through the SAME `resumeInterrupted` path a manual resume takes, so the
 * byte-verification rule applies unchanged: an automatic retry that appended blindly would be worse
 * than a manual one, because nobody watched it happen.
 *
 * The attempt counter lives in memory. A restart is a new session and deserves a fresh budget, and
 * persisting it would leave a download that failed four times last week permanently un-retryable
 * today.
 */
const attempts = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Consider an automatic retry for a transfer that just ended. Returns true when one was scheduled, so
 * the caller can leave the row alone instead of writing a `failed` the user is about to see flicker.
 */
export function scheduleAutoRetry(
  state: DownloadState,
  id: string,
  doneState: 'completed' | 'cancelled' | 'interrupted',
): boolean {
  const attemptsSoFar = attempts.get(id) ?? 0;
  const plan = planDownloadRetry({ doneState, attemptsSoFar });
  if (!plan.retry) {
    if (plan.reason === 'budget-exhausted') {
      Logger.info('Download retry budget exhausted; leaving it failed', { id, attemptsSoFar });
    }
    forget(id);
    return false;
  }

  attempts.set(id, attemptsSoFar + 1);
  // `paused`, not `failed`: the transfer is waiting, and a row that says "failed" while a retry is
  // pending is telling the user something that is about to stop being true.
  patch(state, id, { status: 'paused', error: undefined });
  Logger.info('Retrying an interrupted download', {
    id,
    attempt: attemptsSoFar + 1,
    delayMs: plan.delayMs,
  });

  const timer = setTimeout(() => {
    timers.delete(id);
    const record = state.records.get(id);
    // The user may have cancelled or cleared it during the wait; a timer that fires into a record
    // that is gone must do nothing rather than resurrect it.
    if (record === undefined || record.status !== 'paused') return;
    try {
      const resumed = resumeInterrupted(state, record);
      if (resumed.action !== 'resume') {
        // The bytes on disk cannot be trusted, so this is not a resume — and re-downloading from zero
        // is a decision for the person, not for a timer.
        patch(state, id, { status: 'failed', error: resumed.reason });
        forget(id);
      }
    } catch (err) {
      Logger.warn('Automatic download retry failed', { id, err: String(err) });
      patch(state, id, { status: 'failed' });
      forget(id);
    }
  }, plan.delayMs);
  // Never hold the process open for a retry: a quit is a quit.
  timer.unref?.();
  timers.set(id, timer);
  return true;
}

/** Drop any pending retry for a download — cancelled, cleared, or finished. */
export function forget(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
  attempts.delete(id);
}

/** Cancel every pending retry (quit, or a test tearing down). */
export function forgetAll(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  attempts.clear();
}

/** Attempts made so far, for tests and for the log line that reports the budget. */
export function attemptsFor(id: string): number {
  return attempts.get(id) ?? 0;
}
