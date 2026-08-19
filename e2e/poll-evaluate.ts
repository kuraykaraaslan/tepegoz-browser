/**
 * Run a main-process evaluate inside an `expect.poll`, treating a torn-down execution context as
 * "not yet" rather than as a failure.
 *
 * `app.evaluate` rejects with *"Execution context was destroyed, most likely because of a navigation"*
 * when a navigation lands mid-call — and inside `expect.poll` a rejection ends the whole poll instead of
 * retrying it. A poll exists precisely to wait for a state that has not settled, so a transient teardown
 * is the normal case there, not an error.
 *
 * Left unguarded this produced a flake in roughly one run of three, wandering between tests: the poll
 * that happened to overlap a navigation was the one that failed. That is the worst shape of flake,
 * because it looks like a different bug every time.
 *
 * Real failures still surface — the poll keeps retrying and times out with the last value, so this hides
 * the race and nothing else. Anything with a meaningful "not yet" value should pass that as `fallback`;
 * `''` and `false` are the usual ones.
 */
export async function pollEvaluate<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
