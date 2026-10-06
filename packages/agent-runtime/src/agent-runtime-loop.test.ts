import { describe, expect, it } from 'vitest';
import { nextDomainState } from './agent-runtime-loop';

describe('nextDomainState', () => {
  it('announces nothing on the very first resolvable site (no prior site to compare against)', () => {
    const r = nextDomainState(undefined, 'https://a.example/page');
    expect(r).toEqual({ announceDomain: null, nextUrl: 'https://a.example/page' });
  });

  it('does not announce a same-registrable-domain subdomain hop', () => {
    const r = nextDomainState('https://mail.example.com/x', 'https://accounts.example.com/y');
    expect(r.announceDomain).toBeNull();
    expect(r.nextUrl).toBe('https://accounts.example.com/y');
  });

  it('announces a real registrable-domain change, naming the NEW domain', () => {
    const r = nextDomainState('https://a.example/page', 'https://b.example/other');
    expect(r).toEqual({ announceDomain: 'b.example', nextUrl: 'https://b.example/other' });
  });

  it('reuses the multi-part-suffix-aware eTLD+1 rule (garanti.com.tr vs evil.com.tr are different)', () => {
    const r = nextDomainState('https://x.garanti.com.tr/y', 'https://x.evil.com.tr/y');
    expect(r.announceDomain).toBe('evil.com.tr');
  });

  it('never announces from/to an unresolvable (internal/blank) page, and does not advance tracking', () => {
    const noCurrent = nextDomainState('https://a.example/page', undefined);
    expect(noCurrent).toEqual({ announceDomain: null, nextUrl: 'https://a.example/page' });

    const blankCurrent = nextDomainState('https://a.example/page', 'about:blank');
    expect(blankCurrent).toEqual({ announceDomain: null, nextUrl: 'https://a.example/page' });
  });

  it('does not re-announce a round trip through an unresolvable page back to the same site', () => {
    const toBlank = nextDomainState('https://a.example/page', 'about:blank');
    const backToA = nextDomainState(toBlank.nextUrl, 'https://a.example/other');
    expect(backToA.announceDomain).toBeNull();
  });
});
