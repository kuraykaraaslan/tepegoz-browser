import { INTERNAL_NEWTAB_URL, type Preferences } from '@tepegoz/desktop-ipc';
import { internalPageBase } from '../App-helpers';

/**
 * Whether the bookmarks bar is drawn for the page in front. Default-on: it shows unless the preference
 * is explicitly false (a prefs object that predates the field still reads as "shown"). With "only on the
 * New Tab page" set, it additionally has to be that page; before prefs have loaded it stays hidden so the
 * bar does not flash in and push the page down.
 */
export function bookmarksBarVisible(
  prefs: Pick<Preferences, 'showBookmarksBar' | 'bookmarksBarOnlyNewTab'> | null,
  currentUrl: string,
): boolean {
  if (prefs === null || prefs.showBookmarksBar === false) return false;
  if (prefs.bookmarksBarOnlyNewTab !== true) return true;
  return internalPageBase(currentUrl) === INTERNAL_NEWTAB_URL;
}
