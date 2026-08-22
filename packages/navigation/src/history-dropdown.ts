/**
 * The back/forward button dropdown — what Chrome shows when you right-click the back or forward
 * button: that tab's navigation history on the side the button faces, nearest entry first.
 *
 * Pure: it takes a snapshot of a tab's history (entries + the active index) and returns the rows to
 * render. Rows carry a relative OFFSET, not an absolute index, because a menu is built from a
 * snapshot but acted on later — after the user picks. The caller re-checks `canGoToOffset` at that
 * point, and an offset degrades honestly (the guard rejects it) where a stale index would silently
 * address a different page.
 */

/** One navigation-history entry — the shape Electron's `NavigationEntry` exposes. */
export interface NavHistoryEntry {
  readonly url: string;
  readonly title: string;
}

/** Which side of the current entry a dropdown faces. */
export type NavHistoryDirection = 'back' | 'forward';

/** A dropdown row: the entry, plus the relative jump that reaches it (negative = back). */
export interface NavHistoryMenuEntry extends NavHistoryEntry {
  readonly offset: number;
}

/** Rows shown before the list stops and the menu offers the full history page (Chrome shows 12). */
export const NAV_HISTORY_MENU_MAX = 12;

/**
 * The dropdown rows for one direction, nearest entry first (offset −1, −2, … going back; +1, +2, …
 * going forward). Empty when there is nothing on that side, so a caller can skip popping an empty
 * menu. Out-of-range `activeIndex` (a destroyed or never-navigated tab) yields no rows rather than
 * guessing a position.
 */
export function navHistoryMenuEntries(
  entries: readonly NavHistoryEntry[],
  activeIndex: number,
  direction: NavHistoryDirection,
  limit: number = NAV_HISTORY_MENU_MAX,
): NavHistoryMenuEntry[] {
  if (limit <= 0) return [];
  if (!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= entries.length) return [];
  const step = direction === 'back' ? -1 : 1;
  const rows: NavHistoryMenuEntry[] = [];
  for (let i = activeIndex + step; i >= 0 && i < entries.length && rows.length < limit; i += step) {
    const entry = entries[i];
    if (entry === undefined) continue;
    rows.push({ url: entry.url, title: entry.title, offset: i - activeIndex });
  }
  return rows;
}

/**
 * A row's display text: the page title, falling back to its URL for entries that never reported one.
 * Elided to `max` characters — native menus do not wrap, and an untruncated URL stretches the popup
 * across the screen.
 */
export function navHistoryMenuLabel(entry: NavHistoryEntry, max: number): string {
  const title = entry.title.trim();
  const raw = title.length > 0 ? title : entry.url.trim();
  if (max <= 0) return '';
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}
