import { describe, expect, it } from 'vitest';
import {
  NAV_HISTORY_MENU_MAX,
  navHistoryMenuEntries,
  navHistoryMenuLabel,
  type NavHistoryEntry,
} from './history-dropdown';

/** A history of `n` pages: `p0 … p{n-1}`, titled `P0 … P{n-1}`. */
function history(n: number): NavHistoryEntry[] {
  return Array.from({ length: n }, (_, i) => ({ url: `https://e.test/p${i}`, title: `P${i}` }));
}

describe('navHistoryMenuEntries', () => {
  it('lists the entries behind the current one, nearest first', () => {
    const rows = navHistoryMenuEntries(history(4), 3, 'back');
    expect(rows.map((r) => r.title)).toEqual(['P2', 'P1', 'P0']);
    expect(rows.map((r) => r.offset)).toEqual([-1, -2, -3]);
  });

  it('lists the entries ahead of the current one, nearest first', () => {
    const rows = navHistoryMenuEntries(history(4), 1, 'forward');
    expect(rows.map((r) => r.title)).toEqual(['P2', 'P3']);
    expect(rows.map((r) => r.offset)).toEqual([1, 2]);
  });

  it('is empty at either end, so the caller can skip popping an empty menu', () => {
    expect(navHistoryMenuEntries(history(3), 0, 'back')).toEqual([]);
    expect(navHistoryMenuEntries(history(3), 2, 'forward')).toEqual([]);
    expect(navHistoryMenuEntries([], 0, 'back')).toEqual([]);
  });

  it('caps the list at the limit (default: Chrome’s 12)', () => {
    expect(navHistoryMenuEntries(history(40), 39, 'back')).toHaveLength(NAV_HISTORY_MENU_MAX);
    expect(navHistoryMenuEntries(history(40), 39, 'back', 3).map((r) => r.offset)).toEqual([
      -1, -2, -3,
    ]);
    expect(navHistoryMenuEntries(history(4), 0, 'forward', 0)).toEqual([]);
  });

  it('yields nothing for an out-of-range active index instead of guessing a position', () => {
    expect(navHistoryMenuEntries(history(3), -1, 'forward')).toEqual([]);
    expect(navHistoryMenuEntries(history(3), 3, 'back')).toEqual([]);
    expect(navHistoryMenuEntries(history(3), 1.5, 'back')).toEqual([]);
  });
});

describe('navHistoryMenuLabel', () => {
  it('prefers the title and falls back to the URL when a page reported none', () => {
    expect(navHistoryMenuLabel({ url: 'https://e.test/a', title: 'Article' }, 60)).toBe('Article');
    expect(navHistoryMenuLabel({ url: 'https://e.test/a', title: '   ' }, 60)).toBe(
      'https://e.test/a',
    );
  });

  it('elides past the cap, because native menus do not wrap', () => {
    expect(navHistoryMenuLabel({ url: 'x', title: 'a'.repeat(80) }, 10)).toBe(`${'a'.repeat(9)}…`);
    expect(navHistoryMenuLabel({ url: 'x', title: 'short' }, 10)).toBe('short');
  });
});
