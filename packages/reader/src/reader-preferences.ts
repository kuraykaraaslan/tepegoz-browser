/**
 * Reading-surface preferences — font size and reading theme.
 *
 * These describe the READING SURFACE only. The light / sepia / dark choice here is the paper the
 * article is printed on and is independent of the app's own light/dark theme: a reader on a dark OS
 * theme may still want a warm sepia page, and the reverse. Chrome, Firefox and Safari reader modes all
 * keep the two separate for the same reason.
 *
 * Pure data and arithmetic — no DOM, no React, no persistence. The view applies a preference (a class
 * on the reading container, paired with `reader-view.css`) and the host persists it; this module only
 * says what a valid preference IS and how the font-size buttons move between steps.
 */

export type ReadingTheme = 'light' | 'sepia' | 'dark';

export interface ReaderPreferences {
  /** Multiplier on the reading view's base font size — one of {@link FONT_SCALE_STEPS}. */
  fontScale: number;
  theme: ReadingTheme;
}

/**
 * Font-size steps, smallest to largest. Five stops centred on 1 — the span Firefox's reader offers —
 * so "increase" from the default has as much room left as "decrease".
 */
export const FONT_SCALE_STEPS = [0.85, 1, 1.15, 1.3, 1.5] as const;

export const READING_THEMES: readonly ReadingTheme[] = ['light', 'sepia', 'dark'];

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = { fontScale: 1, theme: 'light' };

/** Snap an arbitrary number to the nearest step — an out-of-range stored value lands on an end stop. */
export function clampFontScale(scale: number): number {
  let best: number = FONT_SCALE_STEPS[0];
  for (const step of FONT_SCALE_STEPS) {
    if (Math.abs(step - scale) < Math.abs(best - scale)) best = step;
  }
  return best;
}

function stepIndex(scale: number): number {
  const snapped = clampFontScale(scale);
  return FONT_SCALE_STEPS.findIndex((step) => step === snapped);
}

/** The next step up, or the current one when already at the ceiling. */
export function increaseFontScale(scale: number): number {
  return FONT_SCALE_STEPS[Math.min(stepIndex(scale) + 1, FONT_SCALE_STEPS.length - 1)] ?? 1;
}

/** The next step down, or the current one when already at the floor. */
export function decreaseFontScale(scale: number): number {
  return FONT_SCALE_STEPS[Math.max(stepIndex(scale) - 1, 0)] ?? 1;
}

export function isFontScaleAtMax(scale: number): boolean {
  return stepIndex(scale) === FONT_SCALE_STEPS.length - 1;
}

export function isFontScaleAtMin(scale: number): boolean {
  return stepIndex(scale) === 0;
}

/** The reading-container class for a theme. Paired with `reader-view.css`. */
export function readingThemeClass(theme: ReadingTheme): string {
  return `reader-theme-${theme}`;
}

/**
 * The reading-container class for a font scale — `reader-scale-0` … `reader-scale-4`. The scale is
 * applied as a class rather than an inline style so no `style` attribute is set anywhere near the
 * extracted content; `reader-view.css` maps each class to its `--reader-font-scale` value.
 */
export function fontScaleClass(scale: number): string {
  return `reader-scale-${String(stepIndex(scale))}`;
}

export function isReadingTheme(value: unknown): value is ReadingTheme {
  return value === 'light' || value === 'sepia' || value === 'dark';
}

/**
 * Coerce an unknown value (a parsed `localStorage` blob, an older shape) into valid
 * {@link ReaderPreferences}. Anything it cannot read falls back to the matching default field, so a
 * corrupt store degrades to the default view rather than breaking it.
 */
export function parseReaderPreferences(raw: unknown): ReaderPreferences {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_READER_PREFERENCES };
  const record = raw as Record<string, unknown>;
  const fontScale = record.fontScale;
  const theme = record.theme;
  return {
    fontScale:
      typeof fontScale === 'number' && Number.isFinite(fontScale)
        ? clampFontScale(fontScale)
        : DEFAULT_READER_PREFERENCES.fontScale,
    theme: isReadingTheme(theme) ? theme : DEFAULT_READER_PREFERENCES.theme,
  };
}
