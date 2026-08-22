import type { PolicyDecision, RiskLevel, TrustLevel, TrustProfile } from '@tepegoz/shared-types';
import { registrableDomain } from './registrable-domain';
import type { PolicyResult } from './policy-kernel';

/**
 * Scoped Trust Profiles (L8) — the standing posture a user sets for a site, in advance.
 *
 * Everything else in this package is a grant: permission GIVEN in reply to a specific prompt, scoped to
 * a run or a named skill. A profile is the other direction — "on this site, don't ask me about this
 * again" or "on this site, ask me about everything" — decided before the agent gets there, and visible
 * and revocable as a list rather than reconstructed from a history of clicks.
 *
 * **A profile can only ever TIGHTEN.** That is the single invariant, and it is enforced here rather
 * than trusted to callers, because the failure mode is silent: a profile that could widen turns a
 * settings screen into a permission-granting surface, and the most dangerous entry in it would be the
 * one a user set six months ago and forgot. Concretely:
 *
 *  - A `deny` stays `deny`. Nothing in a profile can unlock the sensitive-site lockout — banking,
 *    crypto, password and health sites remain read-only no matter what the user configured, because
 *    that lockout exists to protect against the user being socially engineered, not only against the
 *    agent being wrong.
 *  - `destructive` and `financial` always keep their prompt. A trusted site is not a site where money
 *    may move unattended; `NEVER_AUTO_GRANTABLE` in the grant stores encodes the same rule, and a
 *    profile must not become the way around it.
 *  - Tainted arguments always keep their prompt. Trust is placed in a SITE, and taint means the values
 *    came from page content — the thing the trust was not extended to.
 *
 * What remains is real and useful: on a site the user trusts, an ordinary state-changing action can
 * proceed without a prompt, and on a site they do not, everything can be forced to ask.
 */

/**
 * What the kernel needs to apply a profile: the domain, the level, and whether the row is deleted.
 *
 * Deliberately narrower than the persisted `TrustProfile` — the decision does not depend on who wrote
 * the row or when, so nothing here can accidentally start depending on sync metadata, and a test can
 * state a case in three fields instead of seven.
 */
export type TrustRule = Pick<TrustProfile, 'domain' | 'level'> & { tombstone?: boolean };

/** Risk classes a profile may never auto-approve, whatever the user configured. */
const NEVER_AUTO: ReadonlySet<RiskLevel> = new Set<RiskLevel>(['destructive', 'financial']);

/**
 * The profile in force for a URL: the live (non-tombstoned) entry whose domain matches, else `default`.
 *
 * Matching is on the registrable domain, exactly like the grant stores — `evil.com/?x=bank.com` and
 * `bank.com.evil.com` must not inherit `bank.com`'s profile, and eTLD+1 is the boundary that holds.
 */
export function profileFor(url: string | undefined, profiles: readonly TrustRule[]): TrustLevel {
  if (url === undefined) return 'default';
  const domain = registrableDomain(url);
  if (domain === null) return 'default';
  const match = profiles.find((p) => p.tombstone !== true && p.domain === domain);
  return match?.level ?? 'default';
}

export interface TrustAdjustment {
  decision: PolicyDecision;
  /** Set when the profile changed the outcome, so Permission Debug can say a profile was responsible. */
  changedBy?: TrustLevel;
}

/**
 * Apply a trust level to a decision the kernel already made.
 *
 * Takes the kernel's verdict as INPUT rather than replacing it: a profile is a modifier on a decision,
 * never a decision of its own. That ordering is what makes "can only tighten" checkable — there is
 * always a baseline to compare against.
 */
export function applyTrust(
  policy: Pick<PolicyResult, 'decision' | 'reason'>,
  level: TrustLevel,
  ctx: { risk: RiskLevel; taintedArgs: boolean },
): TrustAdjustment {
  // Restricted only ever adds friction, so it needs none of the guards below.
  if (level === 'restricted') {
    return policy.decision === 'allow'
      ? { decision: 'ask', changedBy: 'restricted' }
      : { decision: policy.decision };
  }

  if (level !== 'trusted') return { decision: policy.decision };

  // ── From here down, every branch is a refusal to widen. ────────────────────────────────────────
  // A deny is final. The sensitive-site lockout arrives here as a deny, and a settings screen must not
  // be able to unlock it.
  if (policy.decision !== 'ask') return { decision: policy.decision };
  // Money and deletion keep their prompt on every site. Trusting a site is not the same as agreeing in
  // advance to whatever it costs.
  if (NEVER_AUTO.has(ctx.risk)) return { decision: 'ask' };
  // Trust was placed in the site, not in what the site's own content told the agent to do.
  if (ctx.taintedArgs) return { decision: 'ask' };

  return { decision: 'allow', changedBy: 'trusted' };
}
