import { describe, expect, it } from 'vitest';
import type { PolicyDecision, RiskLevel, TrustLevel } from '@tepegoz/shared-types';
import { TRUST_LEVELS } from '@tepegoz/shared-types';
import { applyTrust, profileFor, type TrustRule } from './trust-profile';

const profile = (domain: string, level: TrustLevel): TrustRule => ({ domain, level });

const ALL_RISKS: RiskLevel[] = ['read', 'state_changing', 'destructive', 'financial'];
const ALL_DECISIONS: PolicyDecision[] = ['allow', 'ask', 'deny'];

describe('profileFor', () => {
  const profiles = [profile('github.com', 'trusted'), profile('news.example', 'restricted')];

  it('matches on the registrable domain, so subdomains inherit', () => {
    expect(profileFor('https://gist.github.com/x', profiles)).toBe('trusted');
    expect(profileFor('https://github.com/', profiles)).toBe('trusted');
  });

  it('does NOT match a look-alike domain', () => {
    // `github.com.evil.com` and `evil.com/?x=github.com` are the two spellings an attacker reaches for.
    // eTLD+1 is the boundary that separates them, and it is the same one the grant stores use.
    expect(profileFor('https://github.com.evil.com/', profiles)).toBe('default');
    expect(profileFor('https://evil.com/?x=github.com', profiles)).toBe('default');
  });

  it('falls back to default for an unknown site, a missing url, or an unparseable one', () => {
    expect(profileFor('https://unknown.example/', profiles)).toBe('default');
    expect(profileFor(undefined, profiles)).toBe('default');
    expect(profileFor('not a url', profiles)).toBe('default');
  });

  it('ignores a tombstoned profile — a deleted row must stop applying', () => {
    const deleted = [{ ...profile('github.com', 'trusted'), tombstone: true }];
    expect(profileFor('https://github.com/', deleted)).toBe('default');
  });
});

describe('a trust profile can only ever TIGHTEN', () => {
  it('never turns a deny into anything else, at any level, for any risk', () => {
    // The sensitive-site lockout reaches here as a deny. A settings screen must not be able to unlock
    // banking, and this is the assertion that says so for every combination rather than one example.
    for (const level of TRUST_LEVELS) {
      for (const risk of ALL_RISKS) {
        for (const tainted of [true, false]) {
          const out = applyTrust({ decision: 'deny', reason: 'sensitive_site_lockout' }, level, {
            risk,
            taintedArgs: tainted,
          });
          expect(out.decision, `${level}/${risk}/tainted=${String(tainted)}`).toBe('deny');
        }
      }
    }
  });

  it('never loosens anything at the restricted level', () => {
    for (const decision of ALL_DECISIONS) {
      for (const risk of ALL_RISKS) {
        const out = applyTrust({ decision, reason: 'read_allowed' }, 'restricted', {
          risk,
          taintedArgs: false,
        });
        // allow → ask (tighter); ask and deny unchanged. Never the other direction.
        expect(out.decision).toBe(decision === 'allow' ? 'ask' : decision);
      }
    }
  });

  it('keeps the prompt for destructive and financial actions on a TRUSTED site', () => {
    // Trusting a site is not agreeing in advance to whatever it deletes or spends. The grant stores
    // encode the same rule as NEVER_AUTO_GRANTABLE; a profile must not become the way around it.
    for (const risk of ['destructive', 'financial'] as RiskLevel[]) {
      const out = applyTrust({ decision: 'ask', reason: 'destructive_confirm' }, 'trusted', {
        risk,
        taintedArgs: false,
      });
      expect(out.decision, risk).toBe('ask');
      expect(out.changedBy).toBeUndefined();
    }
  });

  it('keeps the prompt when the arguments came from the page, even on a trusted site', () => {
    // The trust was placed in the SITE. Taint means the values came from the site's own content, which
    // is precisely what the trust was not extended to.
    const out = applyTrust({ decision: 'ask', reason: 'tainted_side_effect' }, 'trusted', {
      risk: 'state_changing',
      taintedArgs: true,
    });
    expect(out.decision).toBe('ask');
  });
});

describe('what a trust profile is actually FOR', () => {
  it('skips the prompt for an ordinary change on a trusted site', () => {
    const out = applyTrust({ decision: 'ask', reason: 'state_change_confirm' }, 'trusted', {
      risk: 'state_changing',
      taintedArgs: false,
    });
    expect(out.decision).toBe('allow');
    expect(out.changedBy).toBe('trusted');
  });

  it('forces a prompt for a read on a restricted site', () => {
    const out = applyTrust({ decision: 'allow', reason: 'read_allowed' }, 'restricted', {
      risk: 'read',
      taintedArgs: false,
    });
    expect(out.decision).toBe('ask');
    expect(out.changedBy).toBe('restricted');
  });

  it('changes nothing at the default level', () => {
    for (const decision of ALL_DECISIONS) {
      const out = applyTrust({ decision, reason: 'read_allowed' }, 'default', {
        risk: 'state_changing',
        taintedArgs: false,
      });
      expect(out.decision).toBe(decision);
      expect(out.changedBy).toBeUndefined();
    }
  });

  it('reports WHICH level changed the outcome, so the reason is attributable', () => {
    const loosened = applyTrust({ decision: 'ask', reason: 'state_change_confirm' }, 'trusted', {
      risk: 'state_changing',
      taintedArgs: false,
    });
    expect(loosened.changedBy).toBe('trusted');
    const unchanged = applyTrust({ decision: 'ask', reason: 'destructive_confirm' }, 'trusted', {
      risk: 'destructive',
      taintedArgs: false,
    });
    expect(unchanged.changedBy).toBeUndefined();
  });
});
