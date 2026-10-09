/**
 * Which tab a keyboard tab-switch lands on. Pure: the tab model passes the ids in strip order (hidden,
 * kept-alive tabs already removed — they have no place in the strip, so no key should land on one).
 */

/** The tab `delta` steps from `activeId`, wrapping at both ends. With no active tab (or one that is not
 *  in the list) a forward step lands on the first tab and a backward step on the last. `null` when
 *  there is nothing to switch to, or the only tab is already active. */
export function adjacentTabId(
  ids: readonly string[],
  activeId: string | null,
  delta: 1 | -1,
): string | null {
  if (ids.length === 0) return null;
  const at = activeId === null ? -1 : ids.indexOf(activeId);
  const next =
    at === -1 ? (delta === 1 ? 0 : ids.length - 1) : (at + delta + ids.length) % ids.length;
  const id = ids[next] ?? null;
  return id === activeId ? null : id;
}

/** The tab at 1-based `position`, or the last tab for `'last'` (Ctrl+9). A position past the end lands
 *  on nothing — Ctrl+5 with three tabs does not jump to the last one, which is what Chrome does too. */
export function tabIdAtPosition(ids: readonly string[], position: number | 'last'): string | null {
  if (position === 'last') return ids[ids.length - 1] ?? null;
  if (!Number.isInteger(position) || position < 1) return null;
  return ids[position - 1] ?? null;
}
