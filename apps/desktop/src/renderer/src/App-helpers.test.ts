// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWTAB_BACKGROUND,
  EMPTY_TABS,
  effectiveLocale,
  internalPageBase,
  internalPageHash,
} from './App-helpers';

/**
 * The renderer's pure helpers. Small, and two of them decide something a person notices.
 *
 * `effectiveLocale` is the fallback path of a product that calls Turkish first-class: with no explicit
 * preference it reads the OS language, and getting that wrong shows a Turkish user an English browser
 * on first launch, silently, with no error anywhere to point at.
 *
 * `internalPageBase`/`internalPageHash` split a `tepegoz://` url into page and section. They are the
 * routing of every internal page (settings sections, downloads, history), and a wrong split lands the
 * user on the right page's wrong section — or, if the base kept its fragment, on no page at all.
 */

const originalLanguage = navigator.language;

function withNavigatorLanguage(language: string): void {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
}

afterEach(() => {
  vi.restoreAllMocks();
  expect(navigator.language).toBe(originalLanguage);
});

describe('effectiveLocale', () => {
  it('honours an explicit preference over the OS language', () => {
    withNavigatorLanguage('en-US');
    expect(effectiveLocale('tr')).toBe('tr');

    withNavigatorLanguage('tr-TR');
    expect(effectiveLocale('en')).toBe('en');
  });

  it('falls back to the OS language when the preference is "system"', () => {
    withNavigatorLanguage('tr-TR');
    expect(effectiveLocale('system')).toBe('tr');
  });

  it('resolves a plain Turkish tag with no region', () => {
    withNavigatorLanguage('tr');
    expect(effectiveLocale('system')).toBe('tr');
  });

  it('falls back to English for a language the product does not ship', () => {
    withNavigatorLanguage('de-DE');
    expect(effectiveLocale('system')).toBe('en');
  });
});

describe('internal page url splitting', () => {
  const cases: [string, string, string][] = [
    // url                                    base                      hash
    ['tepegoz://settings', 'tepegoz://settings', ''],
    ['tepegoz://settings#privacy', 'tepegoz://settings', 'privacy'],
    ['tepegoz://settings#', 'tepegoz://settings', ''],
    ['tepegoz://downloads#a#b', 'tepegoz://downloads', 'a#b'],
    ['', '', ''],
  ];

  it.each(cases)('splits %s', (url, base, hash) => {
    expect(internalPageBase(url)).toBe(base);
    expect(internalPageHash(url)).toBe(hash);
  });

  it('keeps everything after the FIRST hash in the hash, not just up to the second', () => {
    // A section id is free text; truncating at a second '#' would silently drop part of it.
    expect(internalPageHash('tepegoz://settings#network/proxy#advanced')).toBe(
      'network/proxy#advanced',
    );
  });

  it('never leaves a fragment on the base', () => {
    for (const [url] of cases) {
      expect(internalPageBase(url)).not.toContain('#');
    }
  });
});

describe('the loading-state constants', () => {
  it('starts with no tabs and no navigation available', () => {
    // The toolbar renders from this before the first state push; `canGoBack: true` here would show a
    // live-looking back button that does nothing.
    expect(EMPTY_TABS).toEqual({
      tabs: [],
      groups: [],
      activeId: null,
      canGoBack: false,
      canGoForward: false,
      isPrivate: false,
      activeZoomFactor: 1,
      activeSecurityLevel: 'unknown',
    });
  });

  it('has a fully-specified new-tab background, so no field is undefined mid-render', () => {
    expect(DEFAULT_NEWTAB_BACKGROUND.kind).toBe('default');
    for (const [key, value] of Object.entries(DEFAULT_NEWTAB_BACKGROUND)) {
      expect(value, `${key} must have a concrete fallback`).toBeDefined();
    }
  });
});
