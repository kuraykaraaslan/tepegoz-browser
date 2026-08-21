import type { Mandate, MandateConsumptionRequest } from '@tepegoz/shared-types';
import { registrableDomain } from './registrable-domain';

/**
 * The Transaction Mandate Kernel (Phase 9, L8/L2/L6). "The agent can transact ONLY inside an active
 * mandate; anything outside is denied pre-model at the Capability Broker" — this module is that denial,
 * checked deterministically before a model ever sees the request, and "replay never double-charges" —
 * the fencing property that makes a resumed or retried run safe to resume at all.
 *
 * Two decisions, kept separate on purpose: **is this spend covered** (`mandateCovers` — a pure yes/no
 * against the mandate's own terms), and **may this spend actually be consumed right now** (`consumeMandate`
 * — the same check plus the replay/single-use bookkeeping). A caller that only needs to preview whether a
 * transaction *would* be allowed — before committing to anything — should never need to hand over the
 * mandate's consumption history to find out.
 */

export type MandateDenialReason =
  | 'expired'
  | 'revoked'
  | 'currency_mismatch'
  | 'domain_not_allowed'
  | 'amount_exceeds_mandate'
  | 'unresolvable_domain';

export type MandateCoverage =
  { covered: true; requiresHitl: boolean } | { covered: false; reason: MandateDenialReason };

/**
 * Does this mandate, on its own terms, cover this request right now?
 *
 * Fail-closed at every step, in an order chosen so the reason reported is always the FIRST true cause —
 * an expired, revoked mandate is reported as expired/revoked even if it also would have failed on amount,
 * because that is the fact an auditor actually needs first.
 */
export function mandateCovers(
  mandate: Mandate,
  request: MandateConsumptionRequest,
  opts: { now?: number; revoked?: boolean } = {},
): MandateCoverage {
  const now = opts.now ?? Date.now();
  if (opts.revoked === true) return { covered: false, reason: 'revoked' };
  if (mandate.expiresAt <= now) return { covered: false, reason: 'expired' };
  if (mandate.currency !== request.currency.toUpperCase()) {
    return { covered: false, reason: 'currency_mismatch' };
  }
  const domain = registrableDomain(request.targetUrl);
  if (domain === null) return { covered: false, reason: 'unresolvable_domain' };
  if (!mandate.allowedDomains.some((d) => d.toLowerCase() === domain.toLowerCase())) {
    return { covered: false, reason: 'domain_not_allowed' };
  }
  if (request.amount > mandate.maxAmount)
    return { covered: false, reason: 'amount_exceeds_mandate' };

  return {
    covered: true,
    // A LOWER ceiling inside the mandate's own ceiling — this can only ever ADD a confirmation, never
    // remove the kernel's own unconditional financial-tier HITL (ADR-0006). Absent threshold means "no
    // extra ceiling", not "no confirmation": the baseline financial-tier rule still applies regardless.
    requiresHitl: mandate.hitlThreshold !== undefined && request.amount >= mandate.hitlThreshold,
  };
}

/** One prior spend against a mandate — the minimal shape `consumeMandate` needs from history. */
export interface MandateConsumptionRecord {
  idempotencyKey: string;
  mandateId: string;
}

export type ConsumptionVerdict =
  | { consumed: true; replay: boolean }
  | { consumed: false; reason: MandateDenialReason | 'single_use_exhausted' };

/**
 * Attempt to consume the mandate for this request, against its prior consumption history.
 *
 * The REPLAY check runs before anything else, including expiry — a request that already succeeded once
 * must return the same "yes, already done" answer even if the mandate has since expired or been revoked,
 * because the transaction it is fencing against a double-charge already HAPPENED. A resumed run asking
 * "did my payment go through?" must never get a different answer than the one it got the first time
 * depending on when it asks; that inconsistency is exactly what "no double-charge on resume" is a
 * promise against.
 */
export function consumeMandate(
  mandate: Mandate,
  history: readonly MandateConsumptionRecord[],
  request: MandateConsumptionRequest,
  opts: { now?: number; revoked?: boolean } = {},
): ConsumptionVerdict {
  const priorSameKey = history.find(
    (h) => h.mandateId === mandate.id && h.idempotencyKey === request.idempotencyKey,
  );
  if (priorSameKey !== undefined) return { consumed: true, replay: true };

  const coverage = mandateCovers(mandate, request, opts);
  if (!coverage.covered) return { consumed: false, reason: coverage.reason };

  const anyPriorConsumption = history.some((h) => h.mandateId === mandate.id);
  if (mandate.usage === 'single_use' && anyPriorConsumption) {
    return { consumed: false, reason: 'single_use_exhausted' };
  }

  return { consumed: true, replay: false };
}
