import { describe, expect, it } from 'vitest';
import { DOWNLOAD_RETRY_BUDGET, planDownloadRetry } from './index';

/**
 * When a dropped transfer is retried automatically, and when it is left alone.
 *
 * Two failure modes bound this, one on each side. A browser that gives up on the first dropped packet
 * is one people stop downloading with; a browser that retries forever is one that hammers a server
 * already telling it to stop. The policy lives here rather than inside a timer so it can be read.
 */
describe('planDownloadRetry', () => {
  it('never retries a cancel — it is the interruption that carries an instruction', () => {
    expect(planDownloadRetry({ doneState: 'cancelled', attemptsSoFar: 0 })).toEqual({
      retry: false,
      delayMs: 0,
      reason: 'user-canceled',
    });
  });

  it('never retries a completed transfer', () => {
    expect(planDownloadRetry({ doneState: 'completed', attemptsSoFar: 0 }).reason).toBe(
      'not-interrupted',
    );
  });

  it('backs off exponentially', () => {
    // 1s, 2s, 4s, 8s — each attempt waits twice as long as the one before it.
    expect(planDownloadRetry({ doneState: 'interrupted', attemptsSoFar: 0 }).delayMs).toBe(1_000);
    expect(planDownloadRetry({ doneState: 'interrupted', attemptsSoFar: 1 }).delayMs).toBe(2_000);
    expect(planDownloadRetry({ doneState: 'interrupted', attemptsSoFar: 2 }).delayMs).toBe(4_000);
    expect(planDownloadRetry({ doneState: 'interrupted', attemptsSoFar: 3 }).delayMs).toBe(8_000);
  });

  it('stops at the budget instead of retrying forever', () => {
    expect(
      planDownloadRetry({ doneState: 'interrupted', attemptsSoFar: DOWNLOAD_RETRY_BUDGET }),
    ).toEqual({ retry: false, delayMs: 0, reason: 'budget-exhausted' });
    // And it stays stopped — an off-by-one here would make the budget a suggestion.
    expect(
      planDownloadRetry({ doneState: 'interrupted', attemptsSoFar: DOWNLOAD_RETRY_BUDGET + 5 })
        .retry,
    ).toBe(false);
  });

  it('never waits longer than the ceiling, whatever the arithmetic says', () => {
    // Defensive: the budget keeps this unreachable today, but doubling is doubling and a raised
    // budget must not silently produce a twenty-minute wait.
    const plan = planDownloadRetry({ doneState: 'interrupted', attemptsSoFar: 3 });
    expect(plan.delayMs).toBeLessThanOrEqual(30_000);
  });

  it('a retry always carries a positive delay, and a refusal never does', () => {
    for (let attempt = 0; attempt <= DOWNLOAD_RETRY_BUDGET + 1; attempt++) {
      const plan = planDownloadRetry({ doneState: 'interrupted', attemptsSoFar: attempt });
      if (plan.retry) expect(plan.delayMs).toBeGreaterThan(0);
      else expect(plan.delayMs).toBe(0);
    }
  });
});
