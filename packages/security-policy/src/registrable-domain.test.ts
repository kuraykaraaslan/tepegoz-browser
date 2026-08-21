import { describe, expect, it } from 'vitest';
import { isSameSite, registrableDomain, registrableDomainOfHost } from './registrable-domain';

describe('registrableDomainOfHost', () => {
  it('resolves ordinary two-label suffixes', () => {
    expect(registrableDomainOfHost('example.com')).toBe('example.com');
    expect(registrableDomainOfHost('www.example.com')).toBe('example.com');
    expect(registrableDomainOfHost('a.b.c.example.io')).toBe('example.io');
  });

  it('resolves multi-part suffixes — the case "last two labels" gets catastrophically wrong', () => {
    expect(registrableDomainOfHost('www.garanti.com.tr')).toBe('garanti.com.tr');
    expect(registrableDomainOfHost('internet.isbank.com.tr')).toBe('isbank.com.tr');
    expect(registrableDomainOfHost('turkiye.gov.tr')).toBe('turkiye.gov.tr');
    expect(registrableDomainOfHost('www.bbc.co.uk')).toBe('bbc.co.uk');
    expect(registrableDomainOfHost('shop.example.com.au')).toBe('example.com.au');
  });

  it('refuses to treat a public suffix as a registrable domain', () => {
    expect(registrableDomainOfHost('com.tr')).toBeNull();
    expect(registrableDomainOfHost('co.uk')).toBeNull();
    expect(registrableDomainOfHost('gov.tr')).toBeNull();
  });

  it('returns null when there is no registrable domain', () => {
    expect(registrableDomainOfHost('localhost')).toBeNull();
    expect(registrableDomainOfHost('com')).toBeNull();
    expect(registrableDomainOfHost('')).toBeNull();
  });

  it('treats a literal IP host as its own scope', () => {
    expect(registrableDomainOfHost('127.0.0.1')).toBe('127.0.0.1');
    expect(registrableDomainOfHost('[::1]')).toBe('[::1]');
  });

  it('normalizes case and a trailing root dot', () => {
    expect(registrableDomainOfHost('WWW.Example.COM.')).toBe('example.com');
  });
});

describe('registrableDomain (URL form)', () => {
  it('resolves from a full URL and fails soft on garbage', () => {
    expect(registrableDomain('https://internet.garanti.com.tr/hesaplar?x=1')).toBe(
      'garanti.com.tr',
    );
    expect(registrableDomain('not a url')).toBeNull();
    expect(registrableDomain('')).toBeNull();
  });
});

describe('isSameSite — the grant-scope boundary', () => {
  it('treats sub-domains of one registrable domain as the same site (documented policy)', () => {
    expect(isSameSite('https://mail.example.com/a', 'https://www.example.com/b')).toBe(true);
    expect(isSameSite('https://accounts.garanti.com.tr/', 'https://www.garanti.com.tr/')).toBe(
      true,
    );
  });

  it('NEVER merges two registrable domains that only share a multi-part suffix', () => {
    // The whole reason this module exists: under "last two labels" both sides reduce to `com.tr`
    // and a single grant would span every .com.tr domain in existence.
    expect(isSameSite('https://shop.com.tr/checkout', 'https://evil.com.tr/collect')).toBe(false);
    expect(isSameSite('https://garanti.com.tr/', 'https://akbank.com.tr/')).toBe(false);
    expect(isSameSite('https://bbc.co.uk/', 'https://evil.co.uk/')).toBe(false);
  });

  it('separates ordinary different domains', () => {
    expect(isSameSite('https://example.com/', 'https://example.org/')).toBe(false);
    expect(isSameSite('https://example.com/', 'https://notexample.com/')).toBe(false);
  });

  it('fails closed when either side is unresolvable', () => {
    expect(isSameSite('https://example.com/', 'not a url')).toBe(false);
    expect(isSameSite('http://localhost:3000/', 'http://localhost:3000/')).toBe(false);
  });
});
