import { beforeEach, describe, expect, it } from 'vitest';
import { NEVER_AUTO_GRANTABLE_TIERS } from '@tepegoz/shared-types';
import PlanGrantStore from './plan-grants';
import { resolveAutonomy } from './autonomy-gate';

const RUN = 'run-1';
const SHOP = 'https://www.toolbazaar.com.tr/product/1';

describe('PlanGrantStore — minting', () => {
  beforeEach(() => { PlanGrantStore.clear(); });

  it('scopes a grant to registrable domains, not hostnames', () => {
    const g = PlanGrantStore.mint(RUN, ['https://www.shop.com.tr/a', 'https://cdn.shop.com.tr/b'], ['ui-write']);
    expect(g.domains).toEqual(['shop.com.tr']);
  });

  it('drops the never-grantable tiers instead of rejecting the whole plan', () => {
    // An approved plan containing a payment step still grants its ROUTINE steps; the payment prompts.
    const g = PlanGrantStore.mint(RUN, [SHOP], ['ui-write', 'financial', 'credential', 'destructive', 'read']);
    expect([...g.tiers].sort((a, b) => a.localeCompare(b))).toEqual(['read', 'ui-write']);
    for (const t of NEVER_AUTO_GRANTABLE_TIERS) expect(g.tiers).not.toContain(t);
  });

  it('drops URLs with no resolvable registrable domain', () => {
    const g = PlanGrantStore.mint(RUN, ['not a url', 'http://localhost:3000/', SHOP], ['ui-write']);
    expect(g.domains).toEqual(['toolbazaar.com.tr']);
  });

  it('deduplicates domains and tiers', () => {
    const g = PlanGrantStore.mint(RUN, [SHOP, SHOP], ['ui-write', 'ui-write']);
    expect(g.domains).toHaveLength(1);
    expect(g.tiers).toHaveLength(1);
  });
});

describe('PlanGrantStore — coverage', () => {
  beforeEach(() => {
    PlanGrantStore.clear();
    PlanGrantStore.mint(RUN, [SHOP], ['ui-write', 'data-egress']);
  });

  it('covers a granted tier on a granted domain', () => {
    expect(PlanGrantStore.covers({ runId: RUN, targetUrl: SHOP, tier: 'ui-write' })).toEqual({
      covered: true,
      reason: 'plan_grant',
    });
  });

  it('covers a sub-domain of a granted registrable domain', () => {
    const r = PlanGrantStore.covers({
      runId: RUN,
      targetUrl: 'https://checkout.toolbazaar.com.tr/cart',
      tier: 'ui-write',
    });
    expect(r.covered).toBe(true);
  });

  it('does NOT extend across an off-scope redirect — the integration case the DoD names', () => {
    // Same multi-part suffix, different registrable domain. A naive last-two-labels comparison would
    // have called this the same site and handed the attacker the grant.
    const r = PlanGrantStore.covers({
      runId: RUN,
      targetUrl: 'https://credential-collector.com.tr/collect',
      tier: 'ui-write',
    });
    expect(r).toEqual({ covered: false, reason: 'off_scope_domain' });
  });

  it('does not cover a tier the plan never contained', () => {
    expect(PlanGrantStore.covers({ runId: RUN, targetUrl: SHOP, tier: 'read' }).reason)
      .toBe('tier_not_granted_read');
  });

  it('never covers financial, credential, or destructive — even if asked directly', () => {
    for (const tier of NEVER_AUTO_GRANTABLE_TIERS) {
      const r = PlanGrantStore.covers({ runId: RUN, targetUrl: SHOP, tier });
      expect(r.covered, tier).toBe(false);
      expect(r.reason).toBe(`tier_never_grantable_${tier}`);
    }
  });

  it('fails closed with no target URL — a grant is never a blanket run-wide permission', () => {
    expect(PlanGrantStore.covers({ runId: RUN, targetUrl: undefined, tier: 'ui-write' })).toEqual({
      covered: false,
      reason: 'no_target_url',
    });
  });

  it('fails closed on an unresolvable target', () => {
    expect(PlanGrantStore.covers({ runId: RUN, targetUrl: 'not a url', tier: 'ui-write' }).reason)
      .toBe('unresolvable_domain');
  });

  it('does not leak into another run', () => {
    expect(PlanGrantStore.covers({ runId: 'run-2', targetUrl: SHOP, tier: 'ui-write' })).toEqual({
      covered: false,
      reason: 'no_grant',
    });
  });

  it('stops covering once the run ends', () => {
    PlanGrantStore.revoke(RUN);
    expect(PlanGrantStore.covers({ runId: RUN, targetUrl: SHOP, tier: 'ui-write' }).reason).toBe('no_grant');
  });

  it('is frozen at mint time — an off-scope action re-prompts rather than widening the grant', () => {
    const off = 'https://other.com.tr/x';
    expect(PlanGrantStore.covers({ runId: RUN, targetUrl: off, tier: 'ui-write' }).covered).toBe(false);
    // Nothing about asking changed the grant.
    expect(PlanGrantStore.get(RUN)?.domains).toEqual(['toolbazaar.com.tr']);
    expect(PlanGrantStore.covers({ runId: RUN, targetUrl: off, tier: 'ui-write' }).covered).toBe(false);
  });
});

describe('PlanGrantStore composed with the autonomy gate', () => {
  beforeEach(() => {
    PlanGrantStore.clear();
    PlanGrantStore.mint(RUN, [SHOP], ['ui-write']);
  });

  it('a grant covers what `ask` autonomy would otherwise prompt for', () => {
    const policy = { decision: 'ask' as const, biometric: false };
    expect(resolveAutonomy(policy, 'ask', 'ui-write').decision).toBe('prompt');
    expect(PlanGrantStore.covers({ runId: RUN, targetUrl: SHOP, tier: 'ui-write' }).covered).toBe(true);
  });

  it('neither a grant nor autonomy can reach a denied action', () => {
    // The gateway fails closed on `deny` before confirmation, and the gate agrees.
    expect(resolveAutonomy({ decision: 'deny', biometric: false }, 'auto', 'ui-write').decision).toBe('prompt');
  });

  it('the two paths agree on what must always face a human', () => {
    for (const tier of NEVER_AUTO_GRANTABLE_TIERS) {
      expect(PlanGrantStore.covers({ runId: RUN, targetUrl: SHOP, tier }).covered).toBe(false);
      expect(resolveAutonomy({ decision: 'ask', biometric: false }, 'act', tier).decision).toBe('prompt');
    }
  });
});

describe('a human widening the grant at an approval (S8 PR4)', () => {
  beforeEach(() => { PlanGrantStore.clear(); });

  it('covers the site and class the user just allowed, for the rest of the run', () => {
    PlanGrantStore.grantFromApproval('run-1', 'https://shop.test/cart', 'ui-write');
    expect(
      PlanGrantStore.covers({ runId: 'run-1', targetUrl: 'https://shop.test/checkout', tier: 'ui-write' }).covered,
    ).toBe(true);
  });

  it('adds to an existing plan grant rather than replacing it', () => {
    PlanGrantStore.mint('run-1', ['https://a.test/'], ['read']);
    PlanGrantStore.grantFromApproval('run-1', 'https://b.test/', 'ui-write');
    expect(PlanGrantStore.covers({ runId: 'run-1', targetUrl: 'https://a.test/x', tier: 'read' }).covered).toBe(true);
    expect(PlanGrantStore.covers({ runId: 'run-1', targetUrl: 'https://b.test/x', tier: 'ui-write' }).covered).toBe(true);
  });

  it('still cannot produce a grant over money, secrets, or deletion — however many times it is clicked', () => {
    // The ungrantable tiers are stripped here exactly as at mint time. A human answering prompts is how
    // scope legitimately changes; it is not a way to assemble a permission the system refuses to hold.
    for (const tier of ['financial', 'credential', 'destructive'] as const) {
      PlanGrantStore.grantFromApproval('run-1', 'https://shop.test/', tier);
      expect(
        PlanGrantStore.covers({ runId: 'run-1', targetUrl: 'https://shop.test/x', tier }).covered,
        `tier=${tier}`,
      ).toBe(false);
    }
  });

  it('does not leak to another run', () => {
    PlanGrantStore.grantFromApproval('run-1', 'https://shop.test/', 'ui-write');
    expect(
      PlanGrantStore.covers({ runId: 'run-2', targetUrl: 'https://shop.test/', tier: 'ui-write' }).covered,
    ).toBe(false);
  });
});
