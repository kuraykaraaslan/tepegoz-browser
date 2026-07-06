import { describe, it, expect } from 'vitest';
import { internalPageUrl, isWebUrl, toNavigationUrl } from './navigation-url';

const NT = 'https://duckduckgo.com/';

describe('toNavigationUrl', () => {
  it('passes through http(s) URLs unchanged', () => {
    expect(toNavigationUrl('https://example.com/a?b=1', NT)).toBe('https://example.com/a?b=1');
    expect(toNavigationUrl('http://example.com', NT)).toBe('http://example.com');
  });

  it('prefixes https for bare domains and IPs', () => {
    expect(toNavigationUrl('example.com', NT)).toBe('https://example.com');
    expect(toNavigationUrl('example.com/path', NT)).toBe('https://example.com/path');
    expect(toNavigationUrl('192.168.1.1', NT)).toBe('https://192.168.1.1');
  });

  it('navigates to localhost (http) and host:port', () => {
    expect(toNavigationUrl('localhost:3000', NT)).toBe('http://localhost:3000');
    expect(toNavigationUrl('localhost', NT)).toBe('http://localhost');
    expect(toNavigationUrl('example.com:8080', NT)).toBe('https://example.com:8080');
  });

  it('turns dangerous/unknown schemes into a search (never loads them)', () => {
    for (const s of [
      'file:///C:/Users/secret.txt',
      'file:///etc/passwd',
      'chrome://settings',
      'javascript:alert(1)',
      'data:text/html,<script>x</script>',
      'blob:https://x/abc',
    ]) {
      expect(toNavigationUrl(s, NT)).toMatch(/^https:\/\/duckduckgo\.com\/\?q=/);
      expect(isWebUrl(toNavigationUrl(s, NT))).toBe(true); // result is always a safe http(s) URL
    }
  });

  it('searches free text and empty falls back', () => {
    expect(toNavigationUrl('what is an agentic browser', NT)).toContain('duckduckgo.com/?q=');
    expect(toNavigationUrl('   ', NT)).toBe(NT);
  });
});

describe('isWebUrl', () => {
  it('accepts only http(s)', () => {
    expect(isWebUrl('https://x.com')).toBe(true);
    expect(isWebUrl('http://x.com')).toBe(true);
    expect(isWebUrl('file:///x')).toBe(false);
    expect(isWebUrl('about:blank')).toBe(false);
    expect(isWebUrl('javascript:1')).toBe(false);
  });
});

describe('internalPageUrl', () => {
  const URLS = [
    'tepegoz://settings',
    'tepegoz://extensions',
    'tepegoz://history',
    'tepegoz://downloads',
    'tepegoz://uploads',
  ];

  it('matches a known internal page (trailing-slash + case tolerant)', () => {
    expect(internalPageUrl('tepegoz://settings', URLS)).toBe('tepegoz://settings');
    expect(internalPageUrl('TEPEGOZ://Settings/', URLS)).toBe('tepegoz://settings');
    expect(internalPageUrl('  tepegoz://history//  ', URLS)).toBe('tepegoz://history');
  });

  it('returns null for unknown internal pages and web URLs', () => {
    expect(internalPageUrl('tepegoz://nope', URLS)).toBeNull();
    expect(internalPageUrl('https://example.com', URLS)).toBeNull();
    expect(internalPageUrl('settings', URLS)).toBeNull();
  });
});
