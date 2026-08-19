import { describe, expect, it } from 'vitest';
import {
  REMEMBERED_GRANT_DAYS,
  canRemember,
  coversRemembered,
  rememberedGrantExpiry,
  type RememberedGrantView,
} from './remembered-grants';

const HOUR = 60 * 60 * 1000;
const grant = (over: Partial<RememberedGrantView> = {}): RememberedGrantView => ({
  scope: 'skill-1',
  host: 'billing.test',
  tier: 'ui-write',
  expiresAt: Date.now() + HOUR,
  ...over,
});

const query = (over: Record<string, unknown> = {}) => ({
  scope: 'skill-1',
  targetUrl: 'https://app.billing.test/invoices',
  tier: 'ui-write' as const,
  ...over,
});

describe('remembered grant coverage', () => {
  it('covers a matching action', () => {
    expect(coversRemembered([grant()], query()).covered).toBe(true);
  });

  it('matches on eTLD+1, so a subdomain of the granted site is covered', () => {
    // The user granted "billing.test"; app.billing.test is the same site, not a different one.
    expect(coversRemembered([grant()], query({ targetUrl: 'https://app.billing.test/x' })).covered).toBe(true);
  });

  it('never covers another site', () => {
    expect(coversRemembered([grant()], query({ targetUrl: 'https://other.test/x' })).covered).toBe(false);
  });

  it('never covers an AD-HOC task — only a named skill can hold a persistent grant', () => {
    // A one-off typed prompt has no stable identity, so there would be nothing to recognise or revoke.
    const result = coversRemembered([grant()], query({ scope: null }));
    expect(result).toEqual({ covered: false, reason: 'no_skill_scope' });
  });

  it('never covers a DIFFERENT skill, even on the granted site', () => {
    expect(coversRemembered([grant()], query({ scope: 'skill-2' })).covered).toBe(false);
  });

  it('re-checks EXPIRY in code, not only in the store query', () => {
    // Defence in depth: the SQL filters expired rows, and so does this. Either alone would be enough
    // until the day one of them is refactored.
    const stale = grant({ expiresAt: Date.now() - 1 });
    expect(coversRemembered([stale], query()).covered).toBe(false);
  });

  it('never covers credential, financial, or destructive — those are only ever asked', () => {
    for (const tier of ['credential', 'financial', 'destructive'] as const) {
      const wide = grant({ tier });
      expect(coversRemembered([wide], query({ tier })).covered).toBe(false);
    }
  });

  it('never covers a TAINT prompt — last week is not consent for what the page said today', () => {
    // The kernel asked because web-derived data reached a side-effecting call. That is the
    // injection-containment prompt; answering it from storage is exactly the hole memory could open.
    const result = coversRemembered([grant()], query({ policyReason: 'tainted_side_effect' }));
    expect(result).toEqual({ covered: false, reason: 'never_remembered_tainted_side_effect' });
  });

  it('never covers a sensitive-site read', () => {
    expect(coversRemembered([grant()], query({ policyReason: 'sensitive_site_read' })).covered).toBe(false);
  });

  it('refuses without a target URL rather than treating the grant as run-wide', () => {
    expect(coversRemembered([grant()], query({ targetUrl: undefined })).covered).toBe(false);
  });

  it('refuses an unresolvable target', () => {
    expect(coversRemembered([grant()], query({ targetUrl: 'not-a-url' })).covered).toBe(false);
  });

  it('refuses when there is simply no grant', () => {
    expect(coversRemembered([], query())).toEqual({ covered: false, reason: 'no_remembered_grant' });
  });
});

describe('what may be offered for remembering', () => {
  it('offers an ordinary skill-scoped page change', () => {
    expect(canRemember({ scope: 'skill-1', tier: 'ui-write', targetUrl: 'https://billing.test/x' })).toBe(true);
  });

  it('REFUSES an unclassified call — a default tier would be a permission nobody was offered', () => {
    // null = the action was never risk-classified. A grant is scoped by its tier, so there is
    // nothing to scope one to; defaulting would let a renderer tick "remember" on a prompt that
    // never showed the checkbox.
    expect(canRemember(null)).toBe(false);
  });

  it('does NOT offer what coverage would refuse — a decorative checkbox teaches the wrong lesson', () => {
    expect(canRemember({ scope: null, tier: 'ui-write', targetUrl: 'https://billing.test/x' })).toBe(false);
    expect(canRemember({ scope: 's', tier: 'credential', targetUrl: 'https://billing.test/x' })).toBe(false);
    expect(canRemember({ scope: 's', tier: 'ui-write', targetUrl: undefined })).toBe(false);
    expect(
      canRemember({ scope: 's', tier: 'ui-write', targetUrl: 'https://b.test/x', policyReason: 'tainted_side_effect' }),
    ).toBe(false);
  });
});

describe('expiry', () => {
  it('is bounded — a grant with no horizon is a permission', () => {
    const now = 1_000_000;
    expect(rememberedGrantExpiry(now)).toBe(now + REMEMBERED_GRANT_DAYS * 24 * 60 * 60 * 1000);
    expect(REMEMBERED_GRANT_DAYS).toBeLessThanOrEqual(90);
  });
});
