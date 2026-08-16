import {
  NEVER_AUTO_GRANTABLE_TIERS,
  type RiskTier,
} from '@tepegoz/shared-types';
import { registrableDomain } from './registrable-domain';

/**
 * Plan-scoped grants — `follow_a_plan` (L8).
 *
 * Approving a plan is a **single, informed consent** that covers the routine steps that plan implies,
 * instead of a stream of identical per-tool prompts the user learns to click through. Approval fatigue
 * is a vulnerability in its own right: a grant is what makes the *remaining* prompts meaningful.
 *
 * A grant is narrow by construction, on three axes at once:
 *
 * - **Domains** — registrable domains (eTLD+1), so a redirect to another site is never covered.
 * - **Tool classes** — the {@link RiskTier}s the plan actually contained; nothing wider.
 * - **Run** — keyed by `runId` and revoked when the run ends. A grant cannot outlive the task it was
 *   given for, which is why it never needs to be persisted at all.
 *
 * And three things a grant can **never** do, enforced here rather than left to callers:
 *
 * 1. Cover `financial`, `credential` or `destructive` — those always face a human, every time
 *    ({@link NEVER_AUTO_GRANTABLE_TIERS}).
 * 2. Overturn a `deny`. Grants are consulted only where the kernel already said "ask".
 * 3. Widen after minting. A grant is frozen at approval time; a later action outside it re-prompts,
 *    it does not extend the grant.
 *
 * **Not persisted, deliberately.** Grants are in-memory and run-scoped, so there is no user data at
 * rest and therefore no sync-meta obligation. Should a future phase persist a *remembered* grant
 * (S9's per-task remembered grants), that record is new user data and must carry `updated_at` /
 * `version` / `tombstone`, a UUID PK and `device_id` — see the note on {@link PlanGrant}.
 */

export interface PlanGrant {
  /** The run this grant belongs to. It dies with the run — see the persistence note above. */
  readonly runId: string;
  /** Registrable domains (eTLD+1) the grant covers. Empty ⇒ the grant covers nothing. */
  readonly domains: readonly string[];
  /** Risk tiers the grant covers. Never contains a {@link NEVER_AUTO_GRANTABLE_TIERS} member. */
  readonly tiers: readonly RiskTier[];
}

export interface GrantCoverageQuery {
  runId: string;
  /** The URL the action targets. A grant is never consulted without one. */
  targetUrl?: string | undefined;
  tier: RiskTier;
}

export interface GrantCoverage {
  covered: boolean;
  /** Stable reason code for Permission Debug + audit. */
  reason: string;
}

/** Strip anything a grant is not allowed to carry. Applied at mint time, so a store never holds one. */
function grantableTiers(tiers: readonly RiskTier[]): RiskTier[] {
  const seen = new Set<RiskTier>();
  for (const t of tiers) {
    if (!NEVER_AUTO_GRANTABLE_TIERS.includes(t)) seen.add(t);
  }
  return [...seen];
}

function grantableDomains(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const u of urls) {
    const d = registrableDomain(u);
    if (d !== null) seen.add(d);
  }
  return [...seen];
}

export default class PlanGrantStore {
  private static readonly grants = new Map<string, PlanGrant>();

  /**
   * Mint the grant for an approved plan. `urls` are the pages the plan touches (the run's entry page
   * plus any URL in a step's arguments); `tiers` are the classes its steps classified into.
   *
   * Anything ungrantable is dropped here rather than rejected, so an approved plan that happens to
   * include a payment step still grants its routine steps — and the payment step still prompts.
   */
  static mint(runId: string, urls: readonly string[], tiers: readonly RiskTier[]): PlanGrant {
    const grant: PlanGrant = {
      runId,
      domains: grantableDomains(urls),
      tiers: grantableTiers(tiers),
    };
    PlanGrantStore.grants.set(runId, grant);
    return grant;
  }

  static get(runId: string): PlanGrant | undefined {
    return PlanGrantStore.grants.get(runId);
  }

  /** Revoke at run end. Called from the run's `finally`, so a crash cannot leave a grant behind. */
  static revoke(runId: string): void {
    PlanGrantStore.grants.delete(runId);
  }

  /** Test seam / shutdown. */
  static clear(): void {
    PlanGrantStore.grants.clear();
  }

  /**
   * Whether an action is covered by its run's grant. **Fail-closed at every step**: no grant, no
   * target URL, an unresolvable domain, an off-scope domain, or an ungranted tier all return `false`,
   * which costs a prompt rather than silently permitting the action.
   */
  static covers(q: GrantCoverageQuery): GrantCoverage {
    const grant = PlanGrantStore.grants.get(q.runId);
    if (grant === undefined) return { covered: false, reason: 'no_grant' };

    // A grant can never cover these, even if one somehow reached the store.
    if (NEVER_AUTO_GRANTABLE_TIERS.includes(q.tier)) {
      return { covered: false, reason: `tier_never_grantable_${q.tier}` };
    }
    if (!grant.tiers.includes(q.tier)) {
      return { covered: false, reason: `tier_not_granted_${q.tier}` };
    }

    // Site-scoped by construction: an action with no target cannot be matched against domains, so it
    // is not covered. This is what stops a grant from becoming a blanket run-wide permission.
    if (q.targetUrl === undefined) return { covered: false, reason: 'no_target_url' };
    const domain = registrableDomain(q.targetUrl);
    if (domain === null) return { covered: false, reason: 'unresolvable_domain' };
    if (!grant.domains.includes(domain)) {
      return { covered: false, reason: 'off_scope_domain' };
    }

    return { covered: true, reason: 'plan_grant' };
  }
}
