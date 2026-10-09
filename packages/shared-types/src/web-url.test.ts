import { describe, expect, it } from 'vitest';
import {
  isNavigableWebUrl,
  isSafeSearchTemplate,
  isSecureDnsServerUrl,
  normalizeSiteHost,
  normalizeWebUrlInput,
} from './web-url';

/**
 * The scheme gate for the three preferences that hold an address the browser later navigates to.
 *
 * The case that matters most is the one that shipped: a custom search engine was validated as
 * "contains `{q}`", which `javascript:alert(1)?q={q}` satisfies — so a stored search engine could be a
 * script the omnibox would run. Everything else here exists to keep the fix from being loosened by a
 * later refactor that reaches for a regex.
 */

describe('isNavigableWebUrl', () => {
  it('accepts absolute http and https addresses', () => {
    expect(isNavigableWebUrl('https://example.com')).toBe(true);
    expect(isNavigableWebUrl('http://example.com/a?b=c#d')).toBe(true);
    expect(isNavigableWebUrl('https://xn--ke-eka.com.tr/')).toBe(true);
  });

  it('refuses every scheme that is not the web', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///C:/Windows/System32',
      'tepegoz://settings',
      'chrome://flags',
      'vbscript:msgbox(1)',
    ]) {
      expect(isNavigableWebUrl(value), value).toBe(false);
    }
  });

  it('refuses anything that is not an absolute URL at all', () => {
    for (const value of ['', '   ', 'example.com', '/settings', 'not a url']) {
      expect(isNavigableWebUrl(value), value).toBe(false);
    }
  });
});

describe('isSafeSearchTemplate', () => {
  it('accepts the built-in engine shapes', () => {
    expect(isSafeSearchTemplate('https://www.google.com/search?q={q}')).toBe(true);
    expect(isSafeSearchTemplate('https://duckduckgo.com/?q={q}')).toBe(true);
    expect(isSafeSearchTemplate('https://example.com/{q}/results')).toBe(true);
  });

  it('refuses the template that passed the old `{q}`-only check', () => {
    expect(isSafeSearchTemplate('javascript:alert(1)?q={q}')).toBe(false);
    expect(isSafeSearchTemplate('data:text/html,<img src=x onerror=alert(1)>?q={q}')).toBe(false);
    expect(isSafeSearchTemplate('file:///C:/{q}')).toBe(false);
  });

  it('still requires the placeholder — a URL with nowhere to put the query is not an engine', () => {
    expect(isSafeSearchTemplate('https://example.com/search')).toBe(false);
  });
});

describe('normalizeWebUrlInput', () => {
  it('supplies https for a bare host, the way an address bar would', () => {
    expect(normalizeWebUrlInput('example.com')).toBe('https://example.com');
    expect(normalizeWebUrlInput('  example.com/a  ')).toBe('https://example.com/a');
  });

  it('leaves an address that already has a scheme alone', () => {
    expect(normalizeWebUrlInput('http://example.com')).toBe('http://example.com');
    expect(normalizeWebUrlInput('https://example.com')).toBe('https://example.com');
  });

  it('does NOT rewrite a dangerous scheme into a valid-looking one', () => {
    // The repair must never be able to launder a refusal into an acceptance: `javascript:` comes back
    // untouched and still fails the gate.
    expect(normalizeWebUrlInput('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(isNavigableWebUrl(normalizeWebUrlInput('javascript:alert(1)'))).toBe(false);
    expect(normalizeWebUrlInput('mailto:a@b.c')).toBe('mailto:a@b.c');
  });

  it('leaves empty input empty rather than inventing an address', () => {
    expect(normalizeWebUrlInput('')).toBe('');
    expect(normalizeWebUrlInput('   ')).toBe('');
  });
});

describe('isSecureDnsServerUrl', () => {
  it.each([
    'https://cloudflare-dns.com/dns-query',
    'https://dns.example:8443/dns-query',
    '  https://dns.example/dns-query  ',
    'https://192.0.2.1/dns-query',
  ])('accepts %j', (v) => expect(isSecureDnsServerUrl(v)).toBe(true));

  it.each([
    '',
    'dns.example/dns-query',
    'http://dns.example/dns-query',
    'ftp://dns.example/',
    'javascript:alert(1)',
    'https://user:pass@dns.example/dns-query',
    'https://user@dns.example/dns-query',
    'https://',
    'not a url',
  ])('rejects %j', (v) => expect(isSecureDnsServerUrl(v)).toBe(false));
});

describe('normalizeSiteHost', () => {
  it.each([
    ['example.com', 'example.com'],
    ['  Example.COM ', 'example.com'],
    ['https://www.example.com/path?x=1#y', 'www.example.com'],
    ['http://example.com:8080/', 'example.com'],
    ['example.com.', 'example.com'],
    ['localhost', 'localhost'],
    ['127.0.0.1', '127.0.0.1'],
  ])('reduces %j to %j', (input, host) => expect(normalizeSiteHost(input)).toBe(host));

  it.each([
    '',
    '   ',
    'com',
    'exmaple',
    'two words.com',
    'a..b.com',
    '-bad.com',
    'http://',
    'user:pw@x.com y',
  ])('refuses %j', (input) => expect(normalizeSiteHost(input)).toBe(''));
});
