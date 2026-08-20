import { describe, expect, it } from 'vitest';
import { classifyKamuStep, isKamuDomain } from './kamu-policy';

describe('isKamuDomain', () => {
  it('recognises e-Devlet, GİB, SGK, and MHRS', () => {
    expect(isKamuDomain('https://www.turkiye.gov.tr/giris')).toBe(true);
    expect(isKamuDomain('https://ivd.gib.gov.tr/')).toBe(true);
    expect(isKamuDomain('https://www.sgk.gov.tr/')).toBe(true);
    expect(isKamuDomain('https://mhrs.gov.tr/vatandas')).toBe(true);
  });

  it('matches a subdomain of a Kamu domain', () => {
    expect(isKamuDomain('https://randevu.mhrs.gov.tr/')).toBe(true);
  });

  it('does NOT match an unreviewed gov.tr site outside the four named domains', () => {
    // The whole point of naming domains individually: a Kamu recipe pack has no business claiming
    // coverage of a government site nobody reviewed it against, even though it is still `gov.tr`.
    expect(isKamuDomain('https://tkgm.gov.tr/')).toBe(false);
  });

  it('does not match an unrelated site', () => {
    expect(isKamuDomain('https://example.com/')).toBe(false);
  });

  it('refuses an unparseable URL rather than guessing', () => {
    expect(isKamuDomain('not a url')).toBe(false);
  });
});

describe('classifyKamuStep', () => {
  it('allows a READ step on a Kamu domain with ZERO approval', () => {
    const v = classifyKamuStep({ targetUrl: 'https://www.turkiye.gov.tr/randevu', isStateChanging: false });
    expect(v).toEqual({ decision: 'allow', reason: 'read_only_zero_approval' });
  });

  it('force-asks a STATE-CHANGING step, with biometric, regardless of the tool’s own declared class', () => {
    const v = classifyKamuStep({ targetUrl: 'https://www.turkiye.gov.tr/basvuru', isStateChanging: true });
    expect(v).toEqual({ decision: 'ask', biometric: true, reason: 'kamu_write_forced_hitl' });
  });

  it('reports not_kamu for a domain outside the pack — a signal to fall through, not a refusal', () => {
    const v = classifyKamuStep({ targetUrl: 'https://example.com/', isStateChanging: true });
    expect(v).toEqual({ decision: 'not_kamu' });
  });

  it('a not_kamu verdict for a READ on an unrelated site is not a false "allow"', () => {
    const v = classifyKamuStep({ targetUrl: 'https://example.com/', isStateChanging: false });
    expect(v.decision).toBe('not_kamu');
  });
});
