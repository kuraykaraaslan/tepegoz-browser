import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, migrate, AgentMemoryStore, type Db } from '@tepegoz/persistence';
import { REMEMBERED_GRANT_DAYS } from '@tepegoz/security-policy';
import {
  mayOfferRemember,
  rememberGrant,
  rememberedCoverage,
  resolveSkillScope,
} from './remembered-grant-scope';

/**
 * The main-process half of S9 remembered grants. The coverage rule itself is unit-tested in
 * `@tepegoz/security-policy`; what is pinned HERE is the wiring this module owns and nothing else
 * exercises: binding a run to a skill scope only when the renderer-supplied `skillId` names a real
 * skill AND the run's prompt still matches that skill's stored prompt, and refusing — fail-closed —
 * on a null db, a null scope, an unclassified action, an unresolvable target, or a never-grantable
 * tier, at every one of the three call sites (offer / cover / persist).
 */

let db: Db;
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const SKILL_ID = uuid(1);
const PROMPT = 'Open the invoices page and tell me which are unpaid.';

function seedSkill(prompt = PROMPT): void {
  AgentMemoryStore.putSkill(db, {
    id: SKILL_ID,
    name: 'Weekly invoice check',
    prompt,
    startUrl: 'https://billing.test/invoices',
  });
}

describe('resolveSkillScope', () => {
  it('returns null when there is no database — a scope needs rows to verify against', () => {
    expect(resolveSkillScope(null, SKILL_ID, PROMPT)).toBeNull();
  });

  it('returns null when the renderer named no skill', () => {
    seedSkill();
    expect(resolveSkillScope(db, undefined, PROMPT)).toBeNull();
  });

  it('returns null when the named skill does not exist', () => {
    // The renderer is untrusted; naming a skill that was deleted (or never existed) must not bind.
    expect(resolveSkillScope(db, SKILL_ID, PROMPT)).toBeNull();
  });

  it('returns null when the run prompt no longer matches the stored skill prompt', () => {
    // An edited task is a new task, which gets asked — this is what stops a compromised renderer
    // from claiming a well-granted skill for a different job.
    seedSkill();
    expect(resolveSkillScope(db, SKILL_ID, 'Delete every unpaid invoice.')).toBeNull();
  });

  it('binds when the skill exists and the prompt matches, ignoring surrounding whitespace', () => {
    seedSkill();
    const scope = resolveSkillScope(db, SKILL_ID, `  ${PROMPT}\n`);
    expect(scope).toEqual({ id: SKILL_ID, name: 'Weekly invoice check' });
  });
});

describe('rememberedCoverage', () => {
  const facts = {
    tier: 'ui-write' as const,
    targetUrl: 'https://app.billing.test/invoices',
  };

  it('is not covered without a database', () => {
    expect(rememberedCoverage(null, { id: SKILL_ID, name: 'n' }, facts)).toEqual({
      covered: false,
      reason: 'no_skill_scope',
    });
  });

  it('is not covered for an ad-hoc run with no skill scope', () => {
    expect(rememberedCoverage(db, null, facts)).toEqual({
      covered: false,
      reason: 'no_skill_scope',
    });
  });

  it('is not covered when the action names no target URL', () => {
    expect(
      rememberedCoverage(db, { id: SKILL_ID, name: 'n' }, { tier: 'ui-write' }).covered,
    ).toBe(false);
  });

  it('is not covered when the target URL has no resolvable registrable domain', () => {
    expect(
      rememberedCoverage(db, { id: SKILL_ID, name: 'n' }, { tier: 'ui-write', targetUrl: 'not-a-url' })
        .reason,
    ).toBe('no_target_url');
  });

  it('covers an action when a live grant matches the scope, host (eTLD+1) and tier', () => {
    AgentMemoryStore.putGrant(db, {
      id: uuid(10),
      scope: SKILL_ID,
      host: 'billing.test',
      tier: 'ui-write',
      expiresAt: Date.now() + 60_000,
    });
    expect(rememberedCoverage(db, { id: SKILL_ID, name: 'n' }, facts)).toEqual({
      covered: true,
      reason: 'remembered_grant',
    });
  });

  it('does not let a grant for one tier cover an action of a higher tier', () => {
    AgentMemoryStore.putGrant(db, {
      id: uuid(11),
      scope: SKILL_ID,
      host: 'billing.test',
      tier: 'ui-write',
      expiresAt: Date.now() + 60_000,
    });
    expect(
      rememberedCoverage(db, { id: SKILL_ID, name: 'n' }, { ...facts, tier: 'data-egress' }).covered,
    ).toBe(false);
  });

  it('never covers when the kernel asked because web-derived data reached a side effect', () => {
    // A saved answer from last week is not consent for what a page put in the arguments today.
    AgentMemoryStore.putGrant(db, {
      id: uuid(12),
      scope: SKILL_ID,
      host: 'billing.test',
      tier: 'ui-write',
      expiresAt: Date.now() + 60_000,
    });
    const cov = rememberedCoverage(db, { id: SKILL_ID, name: 'n' }, {
      ...facts,
      policyReason: 'tainted_side_effect',
    });
    expect(cov.covered).toBe(false);
  });
});

describe('mayOfferRemember', () => {
  const facts = { tier: 'ui-write' as const, targetUrl: 'https://billing.test/x' };

  it('refuses when there is no skill scope', () => {
    expect(mayOfferRemember(null, facts)).toBe(false);
  });

  it('refuses when the action was never risk-classified', () => {
    expect(mayOfferRemember({ id: SKILL_ID, name: 'n' }, null)).toBe(false);
  });

  it('offers for a grantable tier on a resolvable target', () => {
    expect(mayOfferRemember({ id: SKILL_ID, name: 'n' }, facts)).toBe(true);
  });

  it('refuses a never-grantable tier however routine the action looks', () => {
    for (const tier of ['financial', 'credential', 'destructive'] as const) {
      expect(mayOfferRemember({ id: SKILL_ID, name: 'n' }, { ...facts, tier })).toBe(false);
    }
  });
});

describe('rememberGrant', () => {
  const scope = { id: SKILL_ID, name: 'Weekly invoice check' };
  const facts = { tier: 'ui-write' as const, targetUrl: 'https://app.billing.test/invoices' };

  it('writes nothing when db, scope or facts is null', () => {
    expect(rememberGrant(null, scope, facts)).toBeNull();
    expect(rememberGrant(db, null, facts)).toBeNull();
    expect(rememberGrant(db, scope, null)).toBeNull();
  });

  it('re-checks the rules rather than trusting the tick — a never-grantable tier writes nothing', () => {
    expect(rememberGrant(db, scope, { ...facts, tier: 'financial' })).toBeNull();
    expect(AgentMemoryStore.liveGrants(db, SKILL_ID, 'billing.test')).toEqual([]);
  });

  it('writes nothing when the target URL has no registrable domain', () => {
    expect(rememberGrant(db, scope, { ...facts, targetUrl: 'not-a-url' })).toBeNull();
  });

  it('persists a grant scoped to the skill and the eTLD+1 host, and returns its bounded expiry', () => {
    const before = Date.now();
    const expiresAt = rememberGrant(db, scope, facts);
    expect(expiresAt).not.toBeNull();
    const horizon = REMEMBERED_GRANT_DAYS * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + horizon);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + horizon);

    // Stored under the registrable domain, not the sub-domain the action happened to target.
    const grants = AgentMemoryStore.liveGrants(db, SKILL_ID, 'billing.test');
    expect(grants).toHaveLength(1);
    expect(grants[0]?.host).toBe('billing.test');

    // And it now covers the same action without a prompt.
    expect(rememberedCoverage(db, scope, facts)).toEqual({
      covered: true,
      reason: 'remembered_grant',
    });
  });
});
