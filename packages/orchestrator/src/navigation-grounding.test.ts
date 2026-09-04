import { describe, expect, it } from 'vitest';
import type { StepOutcome } from './executor';
import {
  buildNavigationGroundingHook,
  buildNavigationGuidance,
  rankActionCandidates,
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
    expect(out[0]).toMatchObject({
      evidence: 'visible-link',
      url: 'https://example.com/blog.html',
    });
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
    expect(out[0]).toMatchObject({
      evidence: 'sitemap',
      url: 'https://example.com/docs/guide.html',
    });
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
      elements: [
        link('Blog', '/blog'),
        link('Our blog', '/blog/'),
        link('Blog again', '/blog#recent'),
      ],
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

/**
 * Regression: the LinkedIn "connect gönder" failure. On a people-search page the agent was handed a
 * navigation hint pointing at a RESULT CARD's profile URL — because the card link's accessible name is
 * the whole card blob and contains the word "Connect" — and so it left the list page it could act on and
 * opened the profile of someone the user was already connected to. Reproduced here with the shapes taken
 * from the real snapshot (`ai_agent_export_2026-08-21_13-24-16`).
 */
describe('on-page action goals (the LinkedIn connect regression)', () => {
  const cardBlob = link(
    'Berkay Akar • 2nd Software Engineer İzmir, Türkiye Connect Embediting Embediting & Çağla Çağlar are mutual connections',
    'https://www.linkedin.com/in/berkay-akar-b1026a227/',
  );
  const connectControl: NavLink = {
    ref: 74,
    role: 'link',
    tag: 'a',
    name: 'Invite Berkay Akar to connect',
    href: 'https://www.linkedin.com/preload/search-custom-invite/?vanityName=berkay-akar-b1026a227',
  };
  const searchUrl = 'https://www.linkedin.com/search/results/people/?page=2';

  it('never grounds a ROUTE on a card blob that merely contains the action verb', () => {
    const out = rankNavigationCandidates({
      goal: 'bunlara connect gönder',
      currentUrl: searchUrl,
      elements: [cardBlob, connectControl],
    });
    expect(out.map((c) => c.url)).not.toContain(
      'https://www.linkedin.com/in/berkay-akar-b1026a227/',
    );
  });

  it('ranks the connect control, and NOT the card blob that merely contains the word', () => {
    const out = rankActionCandidates({
      goal: 'bunlara connect gönder',
      currentUrl: searchUrl,
      elements: [{ ...cardBlob, ref: 51 }, connectControl],
    });
    expect(out).toEqual([{ ref: 74, label: 'Invite Berkay Akar to connect', score: 1 }]);
  });

  it('steers to a CLICK by ref instead of a navigation', () => {
    const guidance = buildNavigationGuidance({
      goal: 'bunlara connect gönder',
      currentUrl: searchUrl,
      elements: [{ ...cardBlob, ref: 51 }, connectControl],
    });
    expect(guidance).toContain('[74] Invite Berkay Akar to connect');
    expect(guidance).toContain('browser_update_page');
    expect(guidance).not.toContain('browser_update_location');
    expect(guidance).not.toContain('linkedin.com/in/berkay-akar');
  });

  it('names several controls and counts the rest, so a list task is not read as a single action', () => {
    const controls: NavLink[] = [74, 168, 210, 240].map((ref) => ({
      ref,
      role: 'link',
      tag: 'a',
      name: `Invite Person ${String(ref)} to connect`,
      href: `https://www.linkedin.com/preload/search-custom-invite/?vanityName=p${String(ref)}`,
    }));
    const guidance = buildNavigationGuidance({
      goal: 'connect gönder',
      currentUrl: searchUrl,
      elements: controls,
    });
    expect(guidance).toContain('[74]');
    expect(guidance).toContain('[210]');
    expect(guidance).toContain('+1 more');
    expect(guidance).toContain('scroll');
  });

  it('ignores a control the model cannot address (no ref) rather than steering at nothing', () => {
    const out = rankActionCandidates({
      goal: 'connect gönder',
      currentUrl: searchUrl,
      elements: [{ role: 'link', tag: 'a', name: 'Invite Berkay Akar to connect' }],
    });
    expect(out).toEqual([]);
  });

  it('matches Turkish action verbs through their suffixes, and short stems whole-token only', () => {
    const el = (ref: number, name: string): NavLink => ({
      ref,
      role: 'button',
      tag: 'button',
      name,
    });
    expect(
      rankActionCandidates({
        goal: 'ürünü sepete ekle',
        currentUrl: 'https://shop.example/p/1',
        elements: [el(3, 'Sepete ekle')],
      }),
    ).toHaveLength(1);
    // "add" is a 3-char stem: whole-token only, so an "Address" label must NOT read as an action control.
    expect(
      rankActionCandidates({
        goal: 'add the item',
        currentUrl: 'https://shop.example/p/1',
        elements: [el(4, 'Address')],
      }),
    ).toEqual([]);
  });

  it('still grounds a real navigation when the goal carries a destination word too', () => {
    const guidance = buildNavigationGuidance({
      goal: 'open the pricing page',
      currentUrl: 'https://example.com/',
      elements: [link('Pricing', 'pricing.html')],
    });
    expect(guidance).toContain('browser_update_location');
    expect(guidance).toContain('https://example.com/pricing.html');
  });
});

describe('action-control ranking prefers the real control', () => {
  it('names the aria-labelled control, not the <div>Connect</div> wrappers around it', () => {
    const wrapper = (ref: number): NavLink => ({ ref, role: '', tag: 'div', name: 'Connect' });
    const guidance = buildNavigationGuidance({
      goal: 'bunlara connect gönder',
      currentUrl: 'https://www.linkedin.com/search/results/people/',
      elements: [
        wrapper(71),
        wrapper(72),
        wrapper(73),
        {
          ref: 74,
          role: 'link',
          tag: 'a',
          name: 'Invite Berkay Akar to connect',
          href: 'https://www.linkedin.com/preload/search-custom-invite/?vanityName=berkay-akar',
        },
      ],
    });
    expect(guidance).toContain('[74] Invite Berkay Akar to connect');
    expect(guidance?.indexOf('[74]')).toBeLessThan(guidance?.indexOf('[71]') ?? Infinity);
  });
});

describe('buildNavigationGroundingHook', () => {
  const outcome = (over: Partial<StepOutcome> = {}): StepOutcome => ({
    stepId: 's1',
    tool: 'browser_get_elements',
    ok: true,
    durationMs: 1,
    result: {
      url: 'https://example.com/',
      elements: [
        { ref: 1, role: 'link', name: 'Blog', href: 'https://example.com/blog.html', tag: 'a' },
        { ref: 2, role: 'link', name: 'Pricing', href: 'https://example.com/pricing.html', tag: 'a' },
      ],
    },
    ...over,
  });
  const goal = 'Open the blog and read the latest post';

  it('is silent for a non-get-elements or failed step, or a shape mismatch', async () => {
    const hook = buildNavigationGroundingHook();
    expect(await hook(outcome({ tool: 'browser_get_page' }), goal)).toBeNull();
    expect(await hook(outcome({ ok: false }), goal)).toBeNull();
    expect(await hook(outcome({ result: { nope: true } }), goal)).toBeNull();
    expect(await hook(outcome({ result: { url: '', elements: [] } }), goal)).toBeNull();
  });

  it('turns a valid element snapshot into the grounded navigation steer', async () => {
    const hint = await buildNavigationGroundingHook()(outcome(), goal);
    expect(hint).toContain('example.com/blog.html');
  });

  it('enriches with same-origin sitemap URLs when a discoverer is supplied', async () => {
    const discover = () => Promise.resolve(['https://example.com/blog/latest-post.html']);
    const hint = await buildNavigationGroundingHook(discover)(
      outcome({ result: { url: 'https://example.com/', elements: [] } }),
      goal,
    );
    expect(hint).toContain('latest-post');
  });

  it('swallows a throwing sitemap discoverer and still grounds on the visible links', async () => {
    const discover = () => Promise.reject(new Error('sitemap fetch failed'));
    const hint = await buildNavigationGroundingHook(discover)(outcome(), goal);
    expect(hint).toContain('example.com/blog.html');
  });
});

describe('the URL-helper catch fallbacks (a malformed currentUrl must not throw)', () => {
  it('rankNavigationCandidates tolerates an unparseable currentUrl', () => {
    expect(() =>
      rankNavigationCandidates({
        goal: 'open the blog',
        currentUrl: 'http://[',
        elements: [link('Blog', 'https://example.com/blog')],
      }),
    ).not.toThrow();
  });
});
