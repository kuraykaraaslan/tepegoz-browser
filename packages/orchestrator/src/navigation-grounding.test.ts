import { describe, expect, it } from 'vitest';
import {
  buildNavigationGuidance,
  rankNavigationCandidates,
  type NavLink,
} from './navigation-grounding';

const link = (name: string, href: string): NavLink => ({ role: 'link', name, href, tag: 'a' });

describe('rankNavigationCandidates', () => {
  it('surfaces a visible link that matches the goal, tagged as visible-link', () => {
    const out = rankNavigationCandidates({
      goal: 'Open the blog and read the latest post',
      currentUrl: 'https://example.com/',
      elements: [link('Blog', 'blog.html'), link('Pricing', 'pricing.html')],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ evidence: 'visible-link', url: 'https://example.com/blog.html' });
    expect(out[0]?.label).toBe('Blog');
  });

  it('NEVER fabricates an ungrounded origin+path: no matching link → no candidate', () => {
    const out = rankNavigationCandidates({
      goal: 'find the blog',
      currentUrl: 'https://example.com/',
      elements: [link('Pricing', 'pricing.html'), link('About', 'about.html')],
    });
    expect(out).toEqual([]);
  });

  it('ranks a matching visible link above a matching sitemap path', () => {
    const out = rankNavigationCandidates({
      goal: 'find the blog',
      currentUrl: 'https://example.com/',
      elements: [link('Blog', 'blog.html')],
      sitemapUrls: ['https://example.com/blog-archive/'],
    });
    expect(out.map((c) => c.evidence)).toEqual(['visible-link', 'sitemap']);
  });

  it('accepts a sitemap-backed path when nothing is linked on the page', () => {
    const out = rankNavigationCandidates({
      goal: 'read the setup guide',
      currentUrl: 'https://example.com/',
      elements: [link('Home', 'index.html')],
      sitemapUrls: ['https://example.com/docs/guide.html', 'https://example.com/pricing.html'],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ evidence: 'sitemap', url: 'https://example.com/docs/guide.html' });
  });

  it('excludes the current page, fragments, mailto/js hrefs, and non-link roles', () => {
    const out = rankNavigationCandidates({
      goal: 'blog',
      currentUrl: 'https://example.com/blog.html',
      elements: [
        link('Blog', 'blog.html'), // self — excluded
        link('Blog top', '#top'), // fragment — excluded
        link('Email the blog team', 'mailto:blog@example.com'), // mailto — excluded
        { role: 'button', name: 'blog toggle', href: 'javascript:void(0)', tag: 'button' }, // not a link
      ],
    });
    expect(out).toEqual([]);
  });

  it('resolves relative and absolute hrefs against the current page', () => {
    const out = rankNavigationCandidates({
      goal: 'checkout',
      currentUrl: 'https://shop.example.com/cart/',
      elements: [link('Checkout', '../checkout')],
    });
    expect(out[0]?.url).toBe('https://shop.example.com/checkout');
  });

  it('dedupes the same destination reached via a trailing slash / hash', () => {
    const out = rankNavigationCandidates({
      goal: 'blog',
      currentUrl: 'https://example.com/',
      elements: [link('Blog', '/blog'), link('Our blog', '/blog/'), link('Blog again', '/blog#recent')],
    });
    expect(out).toHaveLength(1);
  });

  it('matches on the URL path even when the link text is generic (prefix bonus)', () => {
    const out = rankNavigationCandidates({
      goal: 'find the careers page',
      currentUrl: 'https://example.com/',
      elements: [link('Join us', '/careers')],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toBe('https://example.com/careers');
  });

  it('does NOT match a goal keyword that only appears in the HOST (relevance is path/label scoped)', () => {
    // "example" lives in the host example.com, but no path/label matches it → no false candidate.
    const out = rankNavigationCandidates({
      goal: 'open example',
      currentUrl: 'https://example.com/',
      elements: [link('About', 'about.html'), link('Pricing', 'pricing.html')],
      sitemapUrls: ['https://example.com/contact.html'],
    });
    expect(out).toEqual([]);
  });

  it('does NOT match a keyword that is only a mid-word substring of an unrelated token', () => {
    // "news" is a substring of "renews" but not a prefix — must not surface /renew for goal "latest news".
    const out = rankNavigationCandidates({
      goal: 'latest news',
      currentUrl: 'https://example.com/',
      elements: [link('Renews plan', '/renew')],
    });
    expect(out).toEqual([]);
  });

  it('scores the path RELATIVE to the current directory (a shared sub-path "site" prefix is not matched)', () => {
    // All pages live under /blog-not-linked/ (the eval's per-fixture dir). The keyword "blog" must match
    // ONLY the page whose relative remainder carries it — not every sibling via the shared directory name.
    const out = rankNavigationCandidates({
      goal: "find this site's blog",
      currentUrl: 'http://127.0.0.1:9/blog-not-linked/index.html',
      elements: [],
      sitemapUrls: [
        'http://127.0.0.1:9/blog-not-linked/pricing.html',
        'http://127.0.0.1:9/blog-not-linked/about.html',
        'http://127.0.0.1:9/blog-not-linked/blog-2024.html',
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toBe('http://127.0.0.1:9/blog-not-linked/blog-2024.html');
  });
});

describe('buildNavigationGuidance', () => {
  it('names the grounded route and steers away from guessing/searching', () => {
    const guidance = buildNavigationGuidance({
      goal: 'open the blog',
      currentUrl: 'https://example.com/',
      elements: [link('Blog', 'blog.html')],
    });
    expect(guidance).toContain('https://example.com/blog.html');
    expect(guidance).toContain('a link visible on this page');
    expect(guidance).toContain('browser_update_location');
    expect(guidance).toContain('web_search');
  });

  it('credits the sitemap as the evidence when the route is sitemap-backed', () => {
    const guidance = buildNavigationGuidance({
      goal: 'read the guide',
      currentUrl: 'https://example.com/',
      elements: [],
      sitemapUrls: ['https://example.com/guide.html'],
    });
    expect(guidance).toContain("the site's sitemap");
  });

  it('returns null when there is no grounded route to offer (stays silent, not noisy)', () => {
    expect(
      buildNavigationGuidance({
        goal: 'find the blog',
        currentUrl: 'https://example.com/',
        elements: [link('Pricing', 'pricing.html')],
      }),
    ).toBeNull();
  });

  it('caps a hostile long link label so the hint can never bloat into a page-state blob', () => {
    const evil = 'blog ' + 'A'.repeat(2000);
    const guidance = buildNavigationGuidance({
      goal: 'open the blog',
      currentUrl: 'https://example.com/',
      elements: [link(evil, 'blog.html')],
    });
    expect(guidance).not.toBeNull();
    expect(guidance!.length).toBeLessThan(500); // fixed prose + capped label + url, never the 2000-char name
    expect(guidance).toContain('…');
  });
});
