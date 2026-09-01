import { describe, expect, it } from 'vitest';
import {
  interstitialHtml,
  parseProceedSentinel,
  PROCEED_FRAGMENT,
} from './safe-browsing-interstitial.electron';

const URL = 'http://malware.example/x?y=1';

describe('parseProceedSentinel', () => {
  it('returns null for an ordinary URL', () => {
    expect(parseProceedSentinel(URL)).toBeNull();
    expect(parseProceedSentinel('https://example.com/')).toBeNull();
  });

  it('strips the sentinel fragment to recover the clean URL', () => {
    expect(parseProceedSentinel(URL + PROCEED_FRAGMENT)).toBe(URL);
  });
});

describe('interstitialHtml', () => {
  it('is a self-contained document naming the blocked URL and both actions', () => {
    const html = interstitialHtml(URL, 'en');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('malware.example');
    expect(html).toContain('Back to safety');
    expect(html).toContain('Continue anyway');
    expect(html).toContain(`href="${URL}${PROCEED_FRAGMENT}"`);
    // No external resource — it must render inside a data: URL.
    expect(html).not.toMatch(/src=["']https?:/);
  });

  it('localizes to Turkish', () => {
    const html = interstitialHtml(URL, 'tr');
    expect(html).toContain('Güvenli sayfaya dön');
    expect(html).toContain('lang="tr"');
  });

  it('escapes a hostile URL so it cannot break out of the markup', () => {
    const evil = 'http://x/"><script>alert(1)</script>';
    const html = interstitialHtml(evil, 'en');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
});
