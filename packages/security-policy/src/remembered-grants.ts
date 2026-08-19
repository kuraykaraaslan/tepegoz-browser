import { NEVER_AUTO_GRANTABLE_TIERS, type RiskTier } from '@tepegoz/shared-types';
import type { GrantCoverage } from './plan-grants';
import { registrableDomain } from './registrable-domain';

/**
 * Remembered grants (S9) — the persisted cousin of {@link PlanGrantStore}.
 *
 * A plan grant dies with its run, which is why it never needs to be stored. A *remembered* grant
 * deliberately outlives the run: it is how "yes, this weekly task may click Pay Later on billing.test"
 * stops being a question the user answers every Monday. That persistence is exactly what makes it
 * dangerous, so the coverage rule is stricter than the plan grant's on three extra axes:
 *
 * 1. **Scope is a named skill, never an ad-hoc prompt.** A typed one-off task can never mint or match a
 *    persistent grant — there would be nothing stable for the user to recognise or revoke later.
 * 2. **The stored prompt binds.** The caller passes the scope only when the run's prompt still matches
 *    the skill it claims to be. Editing the task makes it a new task, and a new task gets asked. This is
 *    also what stops a compromised renderer from naming someone else's well-granted skill.
 * 3. **Taint is never covered silently.** When the kernel asked *because* web-derived data reached a
 *    side-effecting call, that is the injection-containment prompt — a saved answer from last week is
 *    not consent for what a page put in the arguments today.
 *
 * Everything else is inherited and re-checked here rather than trusted: expiry (the store filters it in
 * SQL, this filters it again in code), the never-grantable tiers, and eTLD+1 host scoping.
 */

/** The fields of a stored grant that decide coverage. Sync-meta stays in the store. */
export interface RememberedGrantView {
  scope: string;
  host: string;
  tier: RiskTier;
  expiresAt: number;
}

export interface RememberedCoverageQuery {
  /** The skill this run is bound to, or null for an ad-hoc task (which is never covered). */
  scope: string | null;
  /** The URL the action targets. A grant is never consulted without one. */
  targetUrl?: string | undefined;
  tier: RiskTier;
  /** The kernel's reason code, so an injection-containment prompt can never be answered from storage. */
  policyReason?: string | undefined;
  now?: number;
}

/** Kernel reasons a remembered grant must never cover, however routine the action looks. */
const NEVER_REMEMBERABLE_REASONS = ['tainted_side_effect', 'sensitive_site_read'];

/**
 * Whether a stored grant covers this action. **Fail-closed at every step** — an ad-hoc run, a missing
 * target, an unresolvable domain, an expired row, a taint prompt, or a never-grantable tier all return
 * `false`, which costs a prompt rather than silently permitting the action.
 */
export function coversRemembered(
  grants: readonly RememberedGrantView[],
  q: RememberedCoverageQuery,
): GrantCoverage {
  if (q.scope === null || q.scope.length === 0) return { covered: false, reason: 'no_skill_scope' };
  if (NEVER_AUTO_GRANTABLE_TIERS.includes(q.tier)) {
    return { covered: false, reason: `tier_never_grantable_${q.tier}` };
  }
  if (q.policyReason !== undefined && NEVER_REMEMBERABLE_REASONS.includes(q.policyReason)) {
    return { covered: false, reason: `never_remembered_${q.policyReason}` };
  }
  if (q.targetUrl === undefined) return { covered: false, reason: 'no_target_url' };
  const domain = registrableDomain(q.targetUrl);
  if (domain === null) return { covered: false, reason: 'unresolvable_domain' };

  const now = q.now ?? Date.now();
  const hit = grants.find(
    (g) => g.scope === q.scope && g.host === domain && g.tier === q.tier && g.expiresAt > now,
  );
  return hit === undefined
    ? { covered: false, reason: 'no_remembered_grant' }
    : { covered: true, reason: 'remembered_grant' };
}

/** How long a remembered grant lives. Bounded on purpose: a grant with no horizon is a permission. */
export const REMEMBERED_GRANT_DAYS = 30;

export function rememberedGrantExpiry(now = Date.now()): number {
  return now + REMEMBERED_GRANT_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Whether this action may be *offered* for remembering at all. Same exclusions as coverage, asked before
 * the prompt is shown: offering a checkbox the system would refuse to honour teaches the user that their
 * choices are decorative.
 */
export function canRemember(q: {
  scope: string | null;
  tier: RiskTier;
  policyReason?: string | undefined;
  targetUrl?: string | undefined;
}): boolean {
  return (
    coversRemembered([], { ...q, now: 0 }).reason === 'no_remembered_grant'
  );
}
