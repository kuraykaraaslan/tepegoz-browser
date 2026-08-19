import { Logger } from '@tepegoz/libs';
import { randomUUID } from 'node:crypto';
import {
  canRemember,
  coversRemembered,
  registrableDomain,
  rememberedGrantExpiry,
  type GrantCoverage,
} from '@tepegoz/security-policy';
import { AgentMemoryStore, type Db } from '@tepegoz/persistence';
import type { RiskTier } from '@tepegoz/shared-types';

/**
 * The main-process half of S9's remembered grants: deciding a run's **scope**, then reading and writing
 * grants for it. The coverage rule itself lives in `@tepegoz/security-policy` (pure, unit-tested); this
 * module only supplies it with rows and a scope.
 *
 * The scope is the load-bearing part. A remembered grant outlives its run, so it needs an identity the
 * user can recognise weeks later and revoke — which an ad-hoc typed prompt does not have. So a run is
 * bound to a scope only when **both**:
 *
 * 1. it names a skill that exists, and
 * 2. its prompt still matches the skill's stored prompt exactly.
 *
 * Rule 2 is what makes a renderer-supplied `skillId` safe. The renderer is untrusted; if it could name
 * any skill, a compromised one would name whichever skill happens to hold the widest grant and inherit
 * it. Binding to the stored prompt means claiming a skill also means running that skill's task — and an
 * edited task is a new task, which gets asked.
 */

export interface RunSkillScope {
  id: string;
  name: string;
}

/** The skill this run is bound to, or null. Anything unverifiable returns null — never a partial bind. */
export function resolveSkillScope(
  db: Db | null,
  skillId: string | undefined,
  prompt: string,
): RunSkillScope | null {
  if (db === null || skillId === undefined) return null;
  const skill = AgentMemoryStore.listSkills(db).find((s) => s.id === skillId);
  if (skill === undefined) return null;
  if (skill.prompt.trim() !== prompt.trim()) {
    Logger.info('Skill scope refused: the run prompt no longer matches the stored skill', { skillId });
    return null;
  }
  return { id: skill.id, name: skill.name };
}

interface ApprovalFacts {
  tier: RiskTier;
  targetUrl?: string | undefined;
  policyReason?: string | undefined;
}

/** Whether a stored grant covers this action. Reads live rows; expiry is filtered in SQL and re-checked. */
export function rememberedCoverage(
  db: Db | null,
  scope: RunSkillScope | null,
  facts: ApprovalFacts,
): GrantCoverage {
  if (db === null || scope === null) return { covered: false, reason: 'no_skill_scope' };
  const domain = facts.targetUrl === undefined ? null : registrableDomain(facts.targetUrl);
  if (domain === null) return { covered: false, reason: 'no_target_url' };
  const grants = AgentMemoryStore.liveGrants(db, scope.id, domain).map((g) => ({
    scope: g.scope,
    host: g.host,
    tier: g.tier,
    expiresAt: g.expiresAt,
  }));
  return coversRemembered(grants, { scope: scope.id, ...facts });
}

/**
 * Whether the approval modal may offer "remember this" at all.
 *
 * `facts` is null when the call was never risk-classified, and that refuses: a grant is scoped BY the
 * risk tier, so an action with no tier has nothing to scope a stored permission to.
 */
export function mayOfferRemember(scope: RunSkillScope | null, facts: ApprovalFacts | null): boolean {
  return canRemember(scope === null || facts === null ? null : { scope: scope.id, ...facts });
}

/**
 * Persist a grant the user ticked. Re-checks `mayOfferRemember` rather than trusting the tick: the
 * renderer relays a click, it does not decide what may be remembered.
 *
 * @returns the expiry timestamp when a grant was written, else null.
 */
export function rememberGrant(
  db: Db | null,
  scope: RunSkillScope | null,
  facts: ApprovalFacts | null,
): number | null {
  if (db === null || scope === null || facts === null || !mayOfferRemember(scope, facts)) return null;
  const domain = facts.targetUrl === undefined ? null : registrableDomain(facts.targetUrl);
  if (domain === null) return null;
  const expiresAt = rememberedGrantExpiry();
  AgentMemoryStore.putGrant(db, {
    id: randomUUID(),
    scope: scope.id,
    host: domain,
    tier: facts.tier,
    expiresAt,
  });
  Logger.info('Remembered a grant for a skill', {
    skill: scope.name,
    host: domain,
    tier: facts.tier,
    expiresAt,
  });
  return expiresAt;
}
