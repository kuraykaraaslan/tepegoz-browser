import type { NewTabShortcut } from '@tepegoz/desktop-ipc';

/** How many shortcuts the grid shows (one Chrome-style row-of-five, two rows). */
export const MAX_SHORTCUTS = 10;

/** Columns in the shortcuts grid — matches the `grid-cols-5` layout. Drives Arrow Up/Down. */
export const GRID_COLUMNS = 5;

/**
 * Where roving focus lands for a key within a `count`-item grid `columns` wide. Returns `current`
 * unchanged when the key is not a navigation key, or when the move would leave the grid — focus
 * clamps at the edges rather than wrapping or escaping.
 */
export function nextRovingIndex(
  key: string,
  current: number,
  count: number,
  columns: number = GRID_COLUMNS,
): number {
  if (count <= 0) return current;
  const last = count - 1;
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'ArrowRight':
      return current < last ? current + 1 : current;
    case 'ArrowLeft':
      return current > 0 ? current - 1 : current;
    case 'ArrowDown':
      return current + columns <= last ? current + columns : current;
    case 'ArrowUp':
      return current - columns >= 0 ? current - columns : current;
    default:
      return current;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function initialOf(shortcut: NewTabShortcut): string {
  const base = shortcut.title.trim() || hostOf(shortcut.url);
  return (base[0] ?? '?').toUpperCase();
}

/** Prepend a scheme if the user typed a bare host (`example.com` → `https://example.com`). Returns
 *  the trimmed input unchanged when it already has one, or is empty. Final validity is the host's call. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('tepegoz://')) return trimmed;
  return `https://${trimmed}`;
}

export type DialogState = { mode: 'add' } | { mode: 'edit'; shortcut: NewTabShortcut };
export type MenuState = { shortcut: NewTabShortcut; x: number; y: number };
