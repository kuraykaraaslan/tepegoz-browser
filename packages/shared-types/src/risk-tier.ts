import { z } from 'zod';

/**
 * The six **risk tiers** an action is classified into at approval time (L8).
 *
 * This is deliberately *not* the same axis as {@link RiskLevelEnum} `dangerClass`. `dangerClass` is
 * what a tool **declares about itself** at registration — coarse, static, and author-supplied. A risk
 * tier is what the policy kernel **derives** from the tool *and its actual arguments and target*, so
 * the same tool lands in different tiers depending on what it is being asked to do: typing into a
 * search box is `ui-write`, typing into a password field is `credential`, and submitting that form to
 * a third-party origin is `data-egress`.
 *
 * Deriving rather than replacing matters for two reasons. A declared class cannot see arguments, so it
 * can never distinguish those three cases. And a self-declared class is a **trust** input — an
 * extension author (or a compromised one) picks it — whereas the derived tier is computed in main from
 * the call itself.
 *
 * Ordered **least to most restrictive**. The classifier returns the *highest* tier that applies, so a
 * new rule can only ever tighten a classification, never loosen one.
 */
export const RISK_TIERS = [
  /** Observation only: reading page content, listing, searching locally. No side effect. */
  'read',
  /** A visible change to page or app state that is neither sensitive nor irreversible. */
  'ui-write',
  /** Data leaves the device or crosses an origin boundary — the exfiltration surface. */
  'data-egress',
  /** Money moves, or a payment instrument is involved. */
  'financial',
  /** A secret is read, typed, or transmitted — passwords, OTPs, API keys, payment card data. */
  'credential',
  /** Irreversible loss: deletion, overwrite, or destruction of user data. */
  'destructive',
] as const;

export type RiskTier = (typeof RISK_TIERS)[number];

export const RiskTierSchema = z.enum(RISK_TIERS);

/**
 * Rank used to resolve "highest tier wins". Higher number = more restrictive. Exported so the kernel,
 * the approval UI, and any future grant logic all order tiers the same way instead of each hard-coding
 * a list.
 */
export const RISK_TIER_RANK: Readonly<Record<RiskTier, number>> = {
  read: 0,
  'ui-write': 1,
  'data-egress': 2,
  financial: 3,
  credential: 4,
  destructive: 5,
};

/**
 * The tiers that mutate something — everything except `read`. These are the classes the advisory
 * intent-critic runs on (bounding its cost) and the ones a plan-scoped grant must name explicitly.
 */
export const MUTATING_RISK_TIERS: readonly RiskTier[] = RISK_TIERS.filter((t) => t !== 'read');

/**
 * Tiers that must **never** be auto-approved by a blanket autonomy level or a plan grant. A human
 * decides each one, every time. (`ui-write` and `data-egress` are grantable; these are not.)
 */
export const NEVER_AUTO_GRANTABLE_TIERS: readonly RiskTier[] = [
  'financial',
  'credential',
  'destructive',
];

/** True when `a` is at least as restrictive as `b`. */
export function isAtLeastAsRestrictive(a: RiskTier, b: RiskTier): boolean {
  return RISK_TIER_RANK[a] >= RISK_TIER_RANK[b];
}

/** The most restrictive tier in `tiers`, or `'read'` when empty. */
export function highestRiskTier(tiers: readonly RiskTier[]): RiskTier {
  let highest: RiskTier = 'read';
  for (const t of tiers) if (RISK_TIER_RANK[t] > RISK_TIER_RANK[highest]) highest = t;
  return highest;
}
