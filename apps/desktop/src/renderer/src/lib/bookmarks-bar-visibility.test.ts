import { describe, expect, it } from 'vitest';
import { INTERNAL_NEWTAB_URL } from '@tepegoz/desktop-ipc';
import { bookmarksBarVisible } from './bookmarks-bar-visibility';

const on = { showBookmarksBar: true, bookmarksBarOnlyNewTab: false };

describe('bookmarksBarVisible', () => {
  it('is hidden until prefs load, and when the bar is switched off', () => {
    expect(bookmarksBarVisible(null, 'https://a.test/')).toBe(false);
    expect(bookmarksBarVisible({ ...on, showBookmarksBar: false }, INTERNAL_NEWTAB_URL)).toBe(
      false,
    );
  });

  it('shows on every page by default, including a prefs object that predates the fields', () => {
    expect(bookmarksBarVisible(on, 'https://a.test/')).toBe(true);
    expect(bookmarksBarVisible({} as never, 'https://a.test/')).toBe(true);
  });

  it('with "only on the New Tab page", shows there and nowhere else', () => {
    const only = { ...on, bookmarksBarOnlyNewTab: true };
    expect(bookmarksBarVisible(only, INTERNAL_NEWTAB_URL)).toBe(true);
    expect(bookmarksBarVisible(only, `${INTERNAL_NEWTAB_URL}#top`)).toBe(true);
    expect(bookmarksBarVisible(only, 'https://a.test/')).toBe(false);
    expect(bookmarksBarVisible(only, 'tepegoz://settings')).toBe(false);
    expect(bookmarksBarVisible(only, '')).toBe(false);
  });
});
