import { describe, expect, it, vi } from 'vitest';
import { createSitemapReader, type SitemapFetch } from './sitemap-reader';

/** A mock same-origin fetch over an in-memory {url → body} map (200 when present, null otherwise). */
function mockFetch(pages: Record<string, string>): SitemapFetch {
  return (url: string) =>
    Promise.resolve(url in pages ? { status: 200, text: pages[url] ?? '' } : null);
}

const SITEMAP = (locs: string[]): string =>
  `<?xml version="1.0"?><urlset>${locs.map((l) => `<loc>${l}</loc>`).join('')}</urlset>`;

describe('createSitemapReader.discover', () => {
  it('reads robots.txt → Sitemap: → sitemap.xml <loc>s (same origin)', async () => {
    const reader = createSitemapReader(
      mockFetch({
        'https://ex.com/robots.txt': 'User-agent: *\nSitemap: https://ex.com/sitemap.xml',
        'https://ex.com/sitemap.xml': SITEMAP(['https://ex.com/blog.html', 'https://ex.com/pricing.html']),
      }),
    );
    const urls = await reader.discover('https://ex.com/index.html');
    expect(urls).toEqual(['https://ex.com/blog.html', 'https://ex.com/pricing.html']);
  });

  it('falls back to the conventional /sitemap.xml when robots.txt is absent', async () => {
    const reader = createSitemapReader(
      mockFetch({ 'https://ex.com/sitemap.xml': SITEMAP(['https://ex.com/guide.html']) }),
    );
    expect(await reader.discover('https://ex.com/')).toEqual(['https://ex.com/guide.html']);
  });

  it('discovers a sitemap under the PAGE directory (multi-tenant sub-path site)', async () => {
    const reader = createSitemapReader(
      mockFetch({ 'http://127.0.0.1:9/site-a/sitemap.xml': SITEMAP(['http://127.0.0.1:9/site-a/deep.html']) }),
    );
    const urls = await reader.discover('http://127.0.0.1:9/site-a/index.html');
    expect(urls).toEqual(['http://127.0.0.1:9/site-a/deep.html']);
  });

  it('DROPS cross-origin locs (SSRF / off-origin cannot be smuggled in through the sitemap)', async () => {
    const reader = createSitemapReader(
      mockFetch({
        'https://ex.com/sitemap.xml': SITEMAP([
          'https://ex.com/ok.html',
          'http://169.254.169.254/latest/meta-data', // must be dropped
          'https://evil.com/x', // must be dropped
        ]),
      }),
    );
    expect(await reader.discover('https://ex.com/')).toEqual(['https://ex.com/ok.html']);
  });

  it('ignores a robots.txt Sitemap: that points off-origin', async () => {
    const reader = createSitemapReader(
      mockFetch({
        'https://ex.com/robots.txt': 'Sitemap: https://evil.com/sitemap.xml',
        'https://evil.com/sitemap.xml': SITEMAP(['https://evil.com/pwned']),
      }),
    );
    expect(await reader.discover('https://ex.com/')).toEqual([]);
  });

  it('follows a sitemap index one bounded level to its child sitemaps', async () => {
    const reader = createSitemapReader(
      mockFetch({
        'https://ex.com/sitemap.xml':
          `<sitemapindex><sitemap><loc>https://ex.com/s1.xml</loc></sitemap></sitemapindex>`,
        'https://ex.com/s1.xml': SITEMAP(['https://ex.com/deep-post.html']),
      }),
    );
    expect(await reader.discover('https://ex.com/')).toEqual(['https://ex.com/deep-post.html']);
  });

  it('returns [] (never throws) when nothing is reachable', async () => {
    const reader = createSitemapReader(mockFetch({}));
    expect(await reader.discover('https://ex.com/')).toEqual([]);
  });

  it('does NOT collide bare-origin URLs of different hosts in the cache (a.com vs b.com)', async () => {
    const reader = createSitemapReader(
      mockFetch({
        'https://a.com/sitemap.xml': SITEMAP(['https://a.com/a-page.html']),
        'https://b.com/sitemap.xml': SITEMAP(['https://b.com/b-page.html']),
      }),
    );
    // No trailing slash / path — the naive `replace(/[^/]*$/,'')` key would collapse both to 'https://'.
    expect(await reader.discover('https://a.com')).toEqual(['https://a.com/a-page.html']);
    expect(await reader.discover('https://b.com')).toEqual(['https://b.com/b-page.html']);
  });

  it('caches per origin+dir — a second discover does not re-fetch', async () => {
    const fetch = vi.fn(mockFetch({ 'https://ex.com/sitemap.xml': SITEMAP(['https://ex.com/a.html']) }));
    const reader = createSitemapReader(fetch);
    await reader.discover('https://ex.com/');
    const calls = fetch.mock.calls.length;
    await reader.discover('https://ex.com/');
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it('resolves RELATIVE <loc>s against the sitemap URL (portable self-hosted fixtures)', async () => {
    const reader = createSitemapReader(
      mockFetch({
        'http://127.0.0.1:9/docs/sitemap.xml': SITEMAP(['setup-guide.html', './api/ref.html']),
      }),
    );
    const urls = await reader.discover('http://127.0.0.1:9/docs/index.html');
    expect(urls).toEqual(['http://127.0.0.1:9/docs/setup-guide.html', 'http://127.0.0.1:9/docs/api/ref.html']);
  });

  it('resolves a RELATIVE robots.txt Sitemap: directive against the robots URL', async () => {
    const reader = createSitemapReader(
      mockFetch({
        'https://ex.com/robots.txt': 'Sitemap: sitemap.xml',
        'https://ex.com/sitemap.xml': SITEMAP(['https://ex.com/found.html']),
      }),
    );
    expect(await reader.discover('https://ex.com/')).toEqual(['https://ex.com/found.html']);
  });

  it('drops a non-2xx source (treated as unreachable)', async () => {
    const reader = createSitemapReader(() => Promise.resolve({ status: 404, text: SITEMAP(['https://ex.com/x']) }));
    expect(await reader.discover('https://ex.com/')).toEqual([]);
  });
});
