import { z } from 'zod';

/**
 * The app runner's out-JSON contract and the verdicts derived from it: which trials are INFRA-invalid
 * (transport flake, transient API error, dead key) and therefore never competence evidence. Pure — no
 * Electron, no filesystem — so the classifiers are unit-testable without launching anything.
 */

/** The out-JSON the app runner writes per scenario — untrusted disk input, so `safeParse`d in `runOne`.
 *  `steps` + `tokenUsage` (AI-1 observability) let the harness score real toolCalls/toolErrors/cost. */
export const EvalOutSchema = z.object({
  summary: z.string().optional(),
  stoppedReason: z.string().optional(),
  /** S4: what the completion evidence supported, when the run reached a completion verdict. */
  completionOutcome: z.enum(['verified', 'attempted_unverified', 'contradicted']).optional(),
  /** S10: escalations the run judged. Absent = none judged, which is the ordinary case. */
  visionEscalations: z.array(z.object({ reason: z.string(), detail: z.string() })).optional(),
  finalUrl: z.string().optional(),
  finalPageText: z.string().optional(),
  error: z.string().optional(),
  steps: z
    .array(
      z.object({
        tool: z.string(),
        ok: z.boolean(),
        error: z.string().optional(),
        // AI-7: the nav/fetch target URL (when the call had a `url` arg) — feeds the escape-rate metric.
        targetUrl: z.string().optional(),
        // Per-step wall-clock from the reactor — feeds the latency metrics. Optional so a report from
        // an older app build still parses (it simply contributes no timing).
        durationMs: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  tokenUsage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalTokens: z.number(),
      // Optional so a report from an app build predating prompt caching still parses; a missing
      // counter contributes 0 and shows up as "cache not used" rather than as a parse failure.
      cacheReadTokens: z.number().optional(),
      cacheWriteTokens: z.number().optional(),
    })
    .optional(),
});
export type EvalOut = z.infer<typeof EvalOutSchema>;

/** The marker `runOne` returns when a trial never produced output — a trial that did not finish, which
 *  is evidence about the harness/budget, NOT about the agent's competence. */
export const CUT_OFF = 'no output';

/** stoppedReasons that mean a TRANSPORT/infra failure terminated the run before the agent could show
 *  competence — a cold-start launch race, a failed fixture navigation, ERR_FAILED / "No active page" —
 *  all funnelled into the broad `navigation_timeout` / `transient_error` bucket by the recovery
 *  classifier. Scored naively these look identical to a wrong answer (empty page → every assertion
 *  fails), which is exactly how a flaky machine has quietly deflated every k/N the harness ever
 *  produced. They are RETRIED, then EXCLUDED from the denominator — never a competence fail. */
const TRANSPORT_STOPPED_REASONS = new Set(['navigation_timeout', 'transient_error']);

/** A DEAD-KEY / account error: the provider rejected the request for BILLING / QUOTA / AUTH reasons, so
 *  the model never reasoned about the task and NO retry can help — the key itself is exhausted or
 *  unauthorized. Observed mid-sweep as `AppError: 400 {..."credit balance is too low ... Plans & Billing"}`.
 *  Scored naively it looks like the agent failing every REMAINING scenario; really the sweep must stop and
 *  those trials are UNMEASURED. (This is what silently turned a real Anthropic sweep into garbage the moment
 *  the key ran out of credits.) */
const DEAD_KEY_RE =
  /credit balance|Plans & Billing|insufficient[_ ]?quota|\bquota\b|invalid[_ ]?api[_ ]?key|\b401\b|authentication_error|permission_error/i;

/** A TRANSIENT infra error surfaced in the run's error string (rate limit / overload / network) — invalid
 *  like a cold-start transport race and worth a retry, UNLIKE a dead key which no retry fixes. */
const TRANSIENT_ERROR_RE =
  /\b429\b|rate[_ ]?limit|overloaded|\b529\b|\b503\b|ECONNRESET|ETIMEDOUT|socket hang up/i;

/** True when the provider key is exhausted/unauthorized (billing/quota/auth) — the sweep should ABORT, not
 *  keep launching doomed trials, and the affected trials are UNMEASURED, never competence fails. */
export function isDeadKeyError(out: EvalOut): boolean {
  return out.error !== undefined && out.error !== CUT_OFF && DEAD_KEY_RE.test(out.error);
}

/** True when a trial is INFRA-invalid (NOT competence evidence): no output (CUT_OFF), a transient API error
 *  (rate limit / overload / network), or a transport error that stopped the run. An ESCAPE that ends in a
 *  nav timeout (the agent navigated off-site to an unreachable URL and spun out) is a real competence
 *  FAILURE, so an escaped trial is never excused — the escape flag tells the two apart. A dead-key error is
 *  handled separately (it aborts rather than retries). */
export function isTransportInvalid(out: EvalOut, escaped: boolean): boolean {
  if (out.error === CUT_OFF) return true;
  if (out.error !== undefined && TRANSIENT_ERROR_RE.test(out.error)) return true;
  return !escaped && TRANSPORT_STOPPED_REASONS.has(out.stoppedReason ?? '');
}
