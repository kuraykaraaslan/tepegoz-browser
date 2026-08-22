import { foldForSearch } from '@tepegoz/i18n';

/**
 * The Command Palette's pure core: modes, filtering, selection and windowing. No React, no DOM.
 *
 * Split out because everything here is a decision that can be wrong in a way a screenshot will not show
 * — which item does Enter run after the list re-filters, what does ↓ do at the bottom, which slice of a
 * 5000-item list is actually rendered. Those are testable as data, and they are the parts that break.
 */

/** The four things a user can be asking for. Chat/Do/Make/Tasks (Phase 1a). */
export const PALETTE_MODES = ['chat', 'do', 'make', 'tasks'] as const;
export type PaletteMode = (typeof PALETTE_MODES)[number];

export interface PaletteCommand {
  id: string;
  /** Shown as the primary line. Already localized by whoever supplied it. */
  title: string;
  /** Optional second line — a path, a URL, a hint. */
  subtitle?: string;
  /** Extra words this command should be findable by (aliases, the English name in a Turkish UI). */
  keywords?: readonly string[];
  run: () => void;
}

/** Commands per mode, supplied by the host — the palette itself knows nothing about the app. */
export type PaletteSources = Readonly<Record<PaletteMode, readonly PaletteCommand[]>>;

/**
 * Filter one mode's commands by the typed query.
 *
 * Matching goes through `foldForSearch`, so it behaves the same as the omnibox and the bookmarks
 * manager — and so a Turkish user typing `istanbul` finds a command titled `İSTANBUL`. Every token must
 * match somewhere (AND, not OR): typing more words narrows, which is the only behaviour that makes a
 * palette usable once the list is long.
 */
export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
): readonly PaletteCommand[] {
  const tokens = foldForSearch(query.trim()).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return commands;
  return commands.filter((c) => {
    const hay = foldForSearch([c.title, c.subtitle ?? '', ...(c.keywords ?? [])].join(' '));
    return tokens.every((t) => hay.includes(t));
  });
}

/** Next mode on Tab; wraps. Shift+Tab goes back. */
export function cycleMode(current: PaletteMode, direction: 1 | -1): PaletteMode {
  const i = PALETTE_MODES.indexOf(current);
  const next = (i + direction + PALETTE_MODES.length) % PALETTE_MODES.length;
  return PALETTE_MODES[next] as PaletteMode;
}

/**
 * Where the highlight lands after an arrow key.
 *
 * Wraps at both ends, because a palette that dead-ends at the bottom makes the last item hard to reach
 * with one hand. Returns 0 for an empty list so the caller never indexes into nothing.
 */
export function moveSelection(current: number, delta: number, count: number): number {
  if (count === 0) return 0;
  return (((current + delta) % count) + count) % count;
}

/**
 * Keep the selection valid when the list changes underneath it.
 *
 * Typing re-filters on every keystroke. Without this the highlight drifts onto whatever now sits at the
 * old index — so Enter runs a command the user never looked at. Clamping to 0 is the safe answer: the
 * top result is what a palette promises.
 */
export function clampSelection(selected: number, count: number): number {
  if (count === 0) return 0;
  return selected >= count ? 0 : Math.max(0, selected);
}

export interface Window {
  /** First index to render. */
  start: number;
  /** One past the last index to render. */
  end: number;
  /** Pixel height of the spacer above the rendered slice. */
  offsetTop: number;
  /** Total scrollable height, so the scrollbar reflects the whole list. */
  totalHeight: number;
}

/**
 * The slice of a long list worth rendering, plus the spacers that keep the scrollbar honest.
 *
 * Hand-rolled rather than pulled from a windowing library: the list is one fixed-height row repeated,
 * which is the one case where virtualization is a few lines of arithmetic, and a dependency here would
 * be carried by every surface that imports the palette.
 *
 * `overscan` renders a few rows beyond the viewport so a fast scroll does not show blank space.
 */
export function visibleWindow(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 4,
): Window {
  const totalHeight = count * rowHeight;
  if (count === 0 || rowHeight <= 0) return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const end = Math.min(count, first + visible);
  return { start: first, end, offsetTop: first * rowHeight, totalHeight };
}

/** Scroll offset that brings `index` fully into view, or null when it already is. */
export function scrollToIndex(
  index: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
): number | null {
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight;
  return null;
}
