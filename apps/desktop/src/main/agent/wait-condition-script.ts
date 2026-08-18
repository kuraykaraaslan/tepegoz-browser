/**
 * The in-page **wait-for-condition** script (S3 PR1).
 *
 * A fixed sleep is the wrong primitive: too short and the agent acts on a page that has not arrived, too
 * long and every step pays for the worst case. This waits for the actual condition and, crucially,
 * reports the truth when it does not arrive — `{ satisfied: false, waitedMs }` is a result the model can
 * reason about, not an error that aborts a run.
 *
 * Never an unbounded spin: the timeout is applied inside the page as well as by the caller, and the
 * poller disconnects itself when it resolves.
 */

/** Poll interval. Short enough to feel immediate, long enough not to compete with the page's own work. */
const POLL_MS = 100;

/** Clamp for the caller's timeout — a hostile or careless argument must not hang the loop. */
export const MIN_WAIT_MS = 100;
export const MAX_WAIT_MS = 30_000;

export function clampWaitMs(raw: number | undefined): number {
  const value = Math.trunc(raw ?? 5_000);
  if (!Number.isFinite(value)) return 5_000;
  return Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, value));
}

/**
 * Build the injectable expression for a `text` or `selector` wait. Returns a promise resolving
 * `{ satisfied, waitedMs }`.
 *
 * `selector` requires the node to be **rendered**, not merely present: a matching node inside a
 * `display: none` container is exactly the false-positive that makes a wait useless — the agent proceeds
 * and then cannot click what it was told had arrived.
 */
export function buildWaitConditionExpression(
  kind: 'text' | 'selector',
  value: string,
  timeoutMs: number,
): string {
  return `(function () { return new Promise(function (resolve) {
  const KIND = ${JSON.stringify(kind)};
  const VALUE = ${JSON.stringify(value)};
  const TIMEOUT = ${String(timeoutMs)};
  const POLL = ${String(POLL_MS)};
  const started = Date.now();

  const rendered = (el) => {
    if (!el) return false;
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const holds = () => {
    try {
      if (KIND === 'text') {
        const text = document.body ? document.body.innerText || '' : '';
        return text.indexOf(VALUE) >= 0;
      }
      return rendered(document.querySelector(VALUE));
    } catch (e) {
      // A malformed selector can never become true; say so immediately rather than burning the budget.
      return null;
    }
  };

  const finish = (satisfied) => {
    clearInterval(timer);
    resolve({ satisfied: satisfied, waitedMs: Date.now() - started });
  };

  const first = holds();
  if (first === null) { resolve({ satisfied: false, waitedMs: 0, invalid: true }); return; }
  if (first) { resolve({ satisfied: true, waitedMs: 0 }); return; }

  const timer = setInterval(() => {
    const now = holds();
    if (now === null || Date.now() - started >= TIMEOUT) { finish(now === true); return; }
    if (now) finish(true);
  }, POLL);
}); })()`;
}
