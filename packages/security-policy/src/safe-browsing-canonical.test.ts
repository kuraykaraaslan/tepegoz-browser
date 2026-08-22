import { describe, expect, it } from 'vitest';
import {
  canonicalizeUrl,
  hostSuffixes,
  normalizeIpv4,
  pathPrefixes,
  urlExpressions,
} from './safe-browsing-canonical';

/**
 * The vectors below are Google's own, published with the Safe Browsing canonicalization spec.
 *
 * They matter more than ordinary tests: our hash only finds an entry if we canonicalize a URL to the
 * exact string Google canonicalized before hashing it. Get this wrong and nothing errors — the lookup
 * simply never matches, a phishing page loads, and every gate stays green. Testing against our own
 * expectations would only prove we are self-consistent.
 */
const canonical = (url: string): string => {
  const c = canonicalizeUrl(url);
  if (c === null) return '(rejected)';
  return `${c.host}${c.path}${c.query === null ? '' : `?${c.query}`}`;
};

describe('canonicalization (Safe Browsing spec vectors)', () => {
  it.each([
    ['http://host/%25%32%35', 'host/%25'],
    ['http://host/%25%32%35%25%32%35', 'host/%25%25'],
    ['http://host/%2525252525252525', 'host/%25'],
    ['http://host/asdf%25%32%35asd', 'host/asdf%25asd'],
    ['http://host/%%%25%32%35asd%%', 'host/%25%25%25asd%25%25'],
    ['http://www.google.com/', 'www.google.com/'],
    ['http://3279880203/blah', '195.127.0.11/blah'],
    ['http://www.google.com/blah/..', 'www.google.com/'],
    ['http://www.evil.com/blah#frag', 'www.evil.com/blah'],
    ['http://www.GOOgle.com/', 'www.google.com/'],
    ['http://www.google.com.../', 'www.google.com/'],
    ['http://www.google.com/foo\tbar\rbaz\n', 'www.google.com/foobarbaz'],
    ['http://www.google.com/q?', 'www.google.com/q?'],
    ['http://www.google.com/q?r?', 'www.google.com/q?r?'],
    ['http://www.google.com/q?r?s', 'www.google.com/q?r?s'],
    ['http://192.168.0.1/', '192.168.0.1/'],
    ['http://195.127.0.11/blah', '195.127.0.11/blah'],
    ['http://host.com/ab%23cd', 'host.com/ab%23cd'],
    ['http://host.com//twoslashes?more//slashes', 'host.com/twoslashes?more//slashes'],
  ])('%s → %s', (input, expected) => {
    expect(canonical(input)).toBe(expected);
  });

  it('rejects anything that is not an http(s) page', () => {
    // A blocklist describes web pages. Canonicalizing `javascript:` or `file:` into something that
    // looks like one would be worse than declining to answer.
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('file:///C:/secret.txt')).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
  });
});

describe('IPv4 normalization', () => {
  it.each([
    ['3279880203', '195.127.0.11'],
    ['0xC0.0x00.0x02.0x01', '192.0.2.1'],
    ['0300.0250.0.1', '192.168.0.1'],
    ['1.2.3', '1.2.0.3'],
    ['16909060', '1.2.3.4'],
    ['192.168.0.1', '192.168.0.1'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeIpv4(input)).toBe(expected);
  });

  it('leaves real hostnames alone', () => {
    // Writing an address in octal or as a bare integer reaches the same server. A blocklist that only
    // matched the pretty spelling would be evaded by spelling the number differently.
    expect(normalizeIpv4('www.google.com')).toBeNull();
    expect(normalizeIpv4('999.1.1.1')).toBeNull();
    expect(normalizeIpv4('1.2.3.4.5')).toBeNull();
  });
});

describe('expression generation (Safe Browsing spec examples)', () => {
  it('expands a.b.c/1/2.html?param=1 into the documented eight', () => {
    expect(urlExpressions('http://a.b.c/1/2.html?param=1').sort()).toEqual(
      [
        'a.b.c/1/2.html?param=1',
        'a.b.c/1/2.html',
        'a.b.c/',
        'a.b.c/1/',
        'b.c/1/2.html?param=1',
        'b.c/1/2.html',
        'b.c/',
        'b.c/1/',
      ].sort(),
    );
  });

  it('caps host expansion at five, starting from the last five components', () => {
    expect(hostSuffixes('a.b.c.d.e.f.g')).toEqual([
      'a.b.c.d.e.f.g',
      'c.d.e.f.g',
      'd.e.f.g',
      'e.f.g',
      'f.g',
    ]);
  });

  it('does not invent parent domains for a bare IP address', () => {
    expect(hostSuffixes('195.127.0.11')).toEqual(['195.127.0.11']);
  });

  it('walks directory prefixes up to four deep, plus the root', () => {
    expect(pathPrefixes('/1/2/3/4/5/6.html', null)).toEqual([
      '/1/2/3/4/5/6.html',
      '/',
      '/1/',
      '/1/2/',
      '/1/2/3/',
      '/1/2/3/4/',
    ]);
  });

  it('never emits more than the spec allows', () => {
    const many = urlExpressions('http://a.b.c.d.e.f.g/1/2/3/4/5/6.html?q=1');
    expect(many.length).toBeLessThanOrEqual(30);
  });
});
