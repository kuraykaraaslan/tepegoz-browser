import { describe, expect, it } from 'vitest';
import { tripEscaped, type EscapeStep } from './escape-metric';

const SITE = 'http://127.0.0.1:9/blog-behind-nav/';
const ENTRY = 'http://127.0.0.1:9/blog-behind-nav/index.html';

const steps = (...s: EscapeStep[]): EscapeStep[] => s;

describe('tripEscaped', () => {
  it('flags a web_search_items call as an escape', () => {
    expect(tripEscaped(steps({ tool: 'web_search_items' }), SITE, ENTRY)).toBe(true);
  });

  it('flags an off-origin navigation', () => {
    expect(
      tripEscaped(
        steps({ tool: 'browser_update_location', targetUrl: 'https://target.com/blog' }),
        SITE,
        ENTRY,
      ),
    ).toBe(true);
  });

  it('flags a same-origin navigation OUT of the fixture directory (another "site")', () => {
    expect(
      tripEscaped(
        steps({
          tool: 'browser_update_location',
          targetUrl: 'http://127.0.0.1:9/other-fixture/index.html',
        }),
        SITE,
        ENTRY,
      ),
    ).toBe(true);
  });

  it('does NOT flag a same-site navigation — even a guessed path (that is fabrication, not escape)', () => {
    expect(
      tripEscaped(
        steps(
          { tool: 'browser_get_elements' },
          { tool: 'browser_update_location', targetUrl: 'blog.html' }, // relative → same dir
          {
            tool: 'browser_update_location',
            targetUrl: 'http://127.0.0.1:9/blog-behind-nav/guessed',
          },
        ),
        SITE,
        ENTRY,
      ),
    ).toBe(false);
  });

  it('flags an off-page web_get_page fetch of another origin', () => {
    expect(
      tripEscaped(
        steps({ tool: 'web_get_page', targetUrl: 'https://en.wikipedia.org/wiki/Foo' }),
        SITE,
        ENTRY,
      ),
    ).toBe(true);
  });

  it('flags opening a NEW TAB at an off-site URL (tab_create_item escape)', () => {
    expect(
      tripEscaped(
        steps({
          tool: 'tab_create_item',
          targetUrl: 'https://www.google.com/search?q=order+A-4471',
        }),
        SITE,
        ENTRY,
      ),
    ).toBe(true);
  });

  it('does NOT flag a urlless new tab (about:blank has no targetUrl)', () => {
    expect(tripEscaped(steps({ tool: 'tab_create_item' }), SITE, ENTRY)).toBe(false);
  });

  it('returns false for a run that stayed entirely on-page', () => {
    expect(
      tripEscaped(
        steps(
          { tool: 'browser_get_elements' },
          { tool: 'browser_update_page' },
          { tool: 'browser_get_page' },
        ),
        SITE,
        ENTRY,
      ),
    ).toBe(false);
  });

  it('is safe on undefined steps and an unparseable entry URL', () => {
    expect(tripEscaped(undefined, SITE, ENTRY)).toBe(false);
    expect(tripEscaped(steps({ tool: 'web_search_items' }), SITE, 'not-a-url')).toBe(false);
  });
});
