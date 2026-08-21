import { sanitizeContent, wrapUntrustedContent } from '@tepegoz/tool-executor';

/**
 * AI-8B — network-layer observation for post-action verification.
 *
 * The agent's only "did it work?" signal used to be DOM-level (url/title/text/`sig` delta), so a **silent**
 * HTTP failure — a "Save" whose POST returns 403/500 while the UI shows nothing — read as an ordinary
 * no-op and the agent happily finished "done". This module is the pure half: the observation shape the
 * host records at the CDP boundary, plus the selection/summary rules that decide what is worth telling
 * the model.
 *
 * Two failure modes are deliberately guarded against, in both directions:
 * - **Silence** (the bug): a real non-2xx on the action's own request is invisible.
 * - **False alarm** (the mirror bug): a third-party pixel 404 or a blocked ad script is NOT the action
 *   failing. Reporting it would teach the agent to distrust successful actions, which is worse than the
 *   original silence. Hence the type filter, the same-origin ranking, and the deliberately hedged wording
 *   ("may not reflect", "verify") — this signal is evidence, never a verdict.
 */

/** One HTTP response (or transport failure) observed on the acting tab. */
export interface NetworkObservation {
  /** Uppercased HTTP method (`''` when the request start was not observed). */
  method: string;
  /** Absolute request url. Page-controlled → untrusted; never rendered without sanitize + fence. */
  url: string;
  /** HTTP status. `0` means no response was produced at all (DNS/refused/blocked by a policy). */
  status: number;
  /** Chromium resource type (`XHR` · `Fetch` · `Document` · `Image` · `Script` · …). */
  type: string;
  /** Host-clock ms (`Date.now()`) at which the event was observed — the action window is measured on the
   *  SAME clock, so no CDP monotonic-vs-epoch conversion is involved. */
  ts: number;
  /** Redirect hops that preceded this response (0 = direct). */
  redirects: number;
  /** Transport error text when `status === 0` (e.g. `net::ERR_CONNECTION_REFUSED`). */
  errorText?: string;
}

/**
 * Resource types whose failure plausibly means *the action* failed. A form POST, an XHR/fetch save, or a
 * document load carry the interaction's intent; an image/script/stylesheet/font/ping does not — those
 * fail constantly on healthy pages (blocked trackers, missing favicons) and would drown the signal.
 */
const ACTION_BEARING_TYPES = new Set(['XHR', 'Fetch', 'Document']);

/** At most this many failures are surfaced — enough to diagnose, not enough to flood the context. */
export const MAX_REPORTED_FAILURES = 3;

/** Longest url path rendered into the summary (page-controlled text; also see {@link displayUrl}). */
const MAX_URL_CHARS = 160;

/** A response that did not succeed: an HTTP error status, or no response at all. */
function isFailure(o: NetworkObservation): boolean {
  return o.status === 0 || o.status >= 400;
}

/**
 * Could this observation EVER matter? Type + outcome only — the cheap test the recorder uses to decide
 * what is worth keeping in its bounded ring, so ordinary page noise (images, scripts, fonts) can never
 * evict the one action-bearing failure the feature exists to catch.
 */
export function isActionBearingFailure(o: NetworkObservation): boolean {
  return ACTION_BEARING_TYPES.has(o.type) && isFailure(o);
}

/**
 * Would this failure actually be shown to the agent? The single predicate for "this matters", shared by
 * the selection below and by the host's diagnostic logging — so an operator reading the log sees exactly
 * the set the model could have seen. Keeping two filters in sync by hand is how a log starts lying.
 *
 * **Same-origin is a FILTER, not a ranking.** A third-party request failing is not this action failing:
 * an analytics endpoint returning 500, or — the case that actually bites here — a request this browser's
 * OWN adblocker refused, would otherwise manufacture "the save failed" on a click that worked. That is
 * the false alarm this module claims to prevent, and ranking cross-origin last did not prevent it.
 *
 * The deliberate cost: a site whose API lives on a different origin (`api.example.com`) has its failures
 * missed. That is the right direction to err — this signal's whole contract is that silence proves
 * nothing, while a false alarm actively teaches the agent to distrust actions that succeeded.
 */
export function isReportableFailure(o: NetworkObservation, pageOrigin: string | null): boolean {
  if (!isActionBearingFailure(o)) return false;
  return pageOrigin !== null && originOf(o.url) === pageOrigin;
}

/** The origin of `url`, or `null` when it is not parseable (data:/blob:/malformed). */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * How a failing request is shown to the model: origin-relative when it is same-origin with the page,
 * absolute otherwise — and **always without the query string or fragment**, which routinely carry session
 * tokens, ids and one-time keys that have no business entering a model prompt.
 */
export function displayUrl(url: string, pageUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Unparseable input must NOT take the stripping guarantee down with it: cut at the first `?`/`#`
    // by hand, so a query string cannot ride the fallback path into the prompt.
    return (url.split(/[?#]/)[0] ?? '').slice(0, MAX_URL_CHARS);
  }
  const bare =
    parsed.origin === originOf(pageUrl) ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
  return bare.slice(0, MAX_URL_CHARS);
}

/**
 * Pick the failures worth reporting for one action window, most-relevant first.
 *
 * Ranking: same-origin before third-party (an action targets its own site), then oldest first so the
 * request the interaction kicked off leads. Capped at {@link MAX_REPORTED_FAILURES}.
 */
export function selectActionFailures(
  observations: readonly NetworkObservation[],
  pageUrl: string,
): NetworkObservation[] {
  const pageOrigin = originOf(pageUrl);
  return observations
    .filter((o) => isReportableFailure(o, pageOrigin))
    .slice()
    .sort((a, b) => a.ts - b.ts) // oldest first: the request the interaction kicked off leads
    .slice(0, MAX_REPORTED_FAILURES);
}

/** One failure as a single line: `POST /api/save → 500`, or `POST /api/save → no response (net::…)`. */
function failureLine(o: NetworkObservation, pageUrl: string): string {
  // An unobserved method is left OUT, never defaulted to "GET" — everything on this line is presented to
  // the model as something the browser saw, so a plausible guess dressed as evidence has no place here.
  const method = o.method.length > 0 ? `${o.method} ` : '';
  const where = displayUrl(o.url, pageUrl);
  const outcome =
    o.status === 0
      ? `no response${o.errorText !== undefined && o.errorText.length > 0 ? ` (${o.errorText})` : ''}`
      : String(o.status);
  const via = o.redirects > 0 ? ` after ${String(o.redirects)} redirect(s)` : '';
  return `${method}${where} → ${outcome}${via}`;
}

/**
 * The model-facing warning for an action window, or `undefined` when nothing failed.
 *
 * **Silence on absence is deliberate.** A quiet window is NOT reported as "all requests succeeded": the
 * recorder only sees a tab it is attached to, so absence of evidence is not evidence of success and this
 * function must never let the agent upgrade "I saw nothing" into "it worked".
 *
 * The request lines are page-controlled, so they are injection-redacted and fenced as untrusted (AI-5);
 * the instruction to the agent stays OUTSIDE the fence, where page text cannot dilute it.
 */
export function describeNetworkFailures(
  failures: readonly NetworkObservation[],
  pageUrl: string,
): string | undefined {
  if (failures.length === 0) return undefined;
  const lines = failures.map((o) => failureLine(o, pageUrl)).join('\n');
  const { text } = sanitizeContent(lines);
  const count = failures.length;
  return (
    `${String(count)} request${count === 1 ? '' : 's'} sent during this interaction did NOT succeed:\n` +
    `${wrapUntrustedContent(text, pageUrl)}\n` +
    'The page may show no error for this. Do NOT report the task as done on the visible page alone — ' +
    'confirm the result (re-read the page, or look for the saved value), and if it really failed, say so ' +
    'instead of retrying blindly.'
  );
}
