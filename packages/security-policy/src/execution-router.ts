import type { AdaptorCapability, AdaptorConnection, RiskLevel } from '@tepegoz/shared-types';

/**
 * Which backend performs a task: the official API, or the browser (Phase 2, L6).
 *
 * The rule is **official API first**, and it is not a preference — it is a safety property. An API call
 * has a declared scope, a revocable token, and a response the caller can validate. Driving the same task
 * through a logged-in page means typing into whatever the site rendered, with the user's full session
 * behind it and no scope at all. The two are not equivalent ways of doing one thing; they are a narrow
 * capability and a broad one.
 *
 * That is why falling back **re-classifies the risk**. The same task — "send this email" — is a scoped
 * `state_changing` call through an API with `gmail.send`, and an unscoped one through a browser holding a
 * session that can also read every message, change the password, and empty the trash. A router that
 * silently substituted the second for the first would quietly widen what the user agreed to.
 *
 * Pure and deterministic: no model, no network, no clock. The decision and its reason are returned so the
 * caller can journal both — a fallback that nobody can see afterwards is a fallback nobody consented to.
 */

export type ExecutionBackend = 'api' | 'browser';

export interface ExecutionRequest {
  /** What the task needs — `mail`, `calendar`, `drive`… */
  capability: AdaptorCapability;
  /** The risk the task carries when performed through a SCOPED API backend. */
  apiRisk: RiskLevel;
  /** Adaptors the user has configured. Only `connected` ones can serve anything. */
  adaptors: readonly AdaptorConnection[];
  /** Whether a browser fallback is possible at all (a logged-in page exists for this task). */
  browserFallbackAvailable: boolean;
}

export interface ExecutionDecision {
  backend: ExecutionBackend | 'none';
  /**
   * The risk class the caller must gate on. Equal to `apiRisk` on the API path; **escalated** on the
   * browser path, because the same act carries more authority there.
   */
  effectiveRisk: RiskLevel;
  /** True when the risk was raised by the fallback — the thing a HITL prompt should say out loud. */
  escalated: boolean;
  /** Stable reason code for the event log and Permission Debug. */
  reason: string;
  /** The adaptor chosen, when the API path was taken. */
  adaptorId?: string;
}

/**
 * How a risk class is re-read when the same task runs through a browser session instead of a scoped
 * token.
 *
 * A `read` becomes `state_changing`, which looks odd until you notice what a browser "read" actually is:
 * navigating a logged-in session, which marks mail as read, advances counters, and touches whatever the
 * page decided to do on load. It is not a read in the sense the API meant.
 *
 * `destructive` and `financial` do not escalate further — there is nothing above them, and pretending
 * otherwise would hide the fact that they were already at the ceiling.
 */
const BROWSER_RISK: Readonly<Record<RiskLevel, RiskLevel>> = {
  read: 'state_changing',
  state_changing: 'destructive',
  destructive: 'destructive',
  financial: 'financial',
};

function servingAdaptor(
  adaptors: readonly AdaptorConnection[],
  capability: AdaptorCapability,
): AdaptorConnection | undefined {
  return adaptors.find(
    (a) =>
      a.state === 'connected' &&
      a.permissions.some((p) => p.capability === capability && p.state === 'connected'),
  );
}

export function routeExecution(req: ExecutionRequest): ExecutionDecision {
  const adaptor = servingAdaptor(req.adaptors, req.capability);
  if (adaptor !== undefined) {
    return {
      backend: 'api',
      effectiveRisk: req.apiRisk,
      escalated: false,
      reason: `api_backend_${adaptor.kind}`,
      adaptorId: adaptor.id,
    };
  }
  if (!req.browserFallbackAvailable) {
    // Refusing is a real answer. "No connected adaptor and no logged-in page" is information the user
    // can act on; guessing at a page and failing halfway is not.
    return {
      backend: 'none',
      effectiveRisk: req.apiRisk,
      escalated: false,
      reason: 'no_backend_available',
    };
  }
  const effectiveRisk = BROWSER_RISK[req.apiRisk];
  return {
    backend: 'browser',
    effectiveRisk,
    escalated: effectiveRisk !== req.apiRisk,
    reason: `browser_fallback_${req.capability}`,
  };
}
