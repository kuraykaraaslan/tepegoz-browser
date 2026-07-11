import type { NewTabShortcut } from '@tepegoz/desktop-ipc';

/** How many shortcuts the grid shows (one Chrome-style row-of-five, two rows). */
export const MAX_SHORTCUTS = 10;

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

/** Prepend a scheme if the user typed a bare host (`avantleap.com` → `https://avantleap.com`). Returns
 *  the trimmed input unchanged when it already has one, or is empty. Final validity is the host's call. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('tepegoz://')) return trimmed;
  return `https://${trimmed}`;
}

export type DialogState = { mode: 'add' } | { mode: 'edit'; shortcut: NewTabShortcut };
export type MenuState = { shortcut: NewTabShortcut; x: number; y: number };
