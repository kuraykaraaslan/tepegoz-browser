import { AA_NON_TEXT, AA_TEXT, contrastRatio, relativeLuminance } from '@tepegoz/ui';

/**
 * Theme application shared by every renderer window (main App + native menu/notification popups +
 * extension popups). Two modes:
 *   - No custom color (`themeColor === ''`): toggle the `.dark` class from the mode (system/light/dark),
 *     letting the design tokens in `@tepegoz/ui/styles/tokens.css` drive everything.
 *   - Custom color: the picked color becomes the base surface; text auto-contrasts (dark color → light
 *     text, light color → dark text) and the other surface/border/accent tokens are derived shades,
 *     applied as inline CSS-variable overrides on `<html>`.
 * Centralized here so the ~5 windows don't each re-implement it.
 */

/** Token vars we override for a custom color (and clear when switching back to a plain mode). */
const CUSTOM_VARS = [
  '--surface-base',
  '--surface-raised',
  '--surface-overlay',
  '--surface-sunken',
  '--text-primary',
  '--text-secondary',
  '--text-disabled',
  '--border',
  '--border-strong',
  '--border-focus',
  '--primary',
  '--primary-hover',
  '--primary-active',
  '--primary-fg',
  '--primary-on-surface',
] as const;

/** A valid 6-digit hex color, e.g. `#7c3aed`. */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Relative luminance, WCAG's definition — re-exported from `@tepegoz/ui` rather than reimplemented.
 *
 * This used to average the raw sRGB channels with no gamma linearization, which reads high for every
 * mid-tone: `#808080` scored 0.50 instead of 0.22, `#06aec4` 0.55 instead of 0.34. The value decided
 * light-vs-dark text on a custom theme colour, so for six of the colours tested it was decided from
 * the wrong number.
 */
export function luminance(hex: string): number {
  return relativeLuminance(hex);
}

/** The candidate text colours a custom theme picks between. */
const LIGHT_TEXT = '#f8fafc';
const DARK_TEXT = '#0f172a';

/**
 * Mix `base` toward white or black in 5% steps until the result clears `minRatio` against `base`.
 *
 * Replaces the fixed shade amounts the derived tokens used. A constant amount cannot hold a contrast
 * promise, because how far 38% travels depends entirely on where it starts: at `shade(base, 0.38)` the
 * focus ring measured 3.39:1 on one preset and 2.09:1 on another, so seven of the eight shipped presets
 * had a focus indicator below the 3:1 that WCAG 1.4.11 asks for. Solving for the ratio instead of
 * guessing an amount is what makes the promise hold for a colour nobody has tried yet — and the picker
 * accepts any colour at all.
 */
function shadeUntil(base: string, towardLight: boolean, minRatio: number): string {
  for (let step = 1; step <= 20; step++) {
    const candidate = shade(base, (towardLight ? 1 : -1) * (step / 20));
    if (contrastRatio(candidate, base) >= minRatio) return candidate;
  }
  return towardLight ? '#ffffff' : '#000000';
}

/**
 * The accent has to satisfy TWO constraints at once, which is why it is not just another `shadeUntil`.
 *
 * It sits on the page as a focus ring and a fill, so it needs 3:1 against the surface — and it carries
 * a label, so one of the two text colours needs 4.5:1 against IT. Solving only the first leaves a
 * mid-tone accent whose own label is unreadable: on `#e0e0e0` the 3:1 accent gave its label 4.22:1.
 * Both constraints, one search.
 */
function accentFor(base: string, towardLight: boolean): string {
  for (let step = 1; step <= 20; step++) {
    const candidate = shade(base, (towardLight ? 1 : -1) * (step / 20));
    const onSurface = contrastRatio(candidate, base) >= AA_NON_TEXT;
    const labelFits = contrastRatio(bestTextOn(candidate), candidate) >= AA_TEXT;
    if (onSurface && labelFits) return candidate;
  }
  return towardLight ? '#ffffff' : '#000000';
}

/** Whichever of the two text colours actually contrasts better — not a luminance threshold.
 *  Thresholding picks a side; this picks the winner, which is the thing that was wanted all along. */
function bestTextOn(base: string): string {
  return contrastRatio(LIGHT_TEXT, base) >= contrastRatio(DARK_TEXT, base) ? LIGHT_TEXT : DARK_TEXT;
}

/** Mix `hex` toward white (amount > 0) or black (amount < 0); amount is a 0..1 fraction. */
function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amount));
  const mix = (c: number): string =>
    Math.round(c + (target - c) * p)
      .toString(16)
      .padStart(2, '0');
  const [r, g, b] = toRgb(hex);
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Force reduced motion on this document, or hand the decision back to the OS.
 *
 * The attribute only ever ADDS a reason to reduce motion: `tokens.css` honours
 * `prefers-reduced-motion` independently, so turning this off restores the OS's answer rather than
 * overriding it with "full motion" — which would be the browser deciding it knows better than an
 * accessibility setting the user already made.
 */
export function applyMotionPreference(reduceMotion: boolean): void {
  const root = document.documentElement;
  if (reduceMotion) root.setAttribute('data-reduce-motion', '1');
  else root.removeAttribute('data-reduce-motion');
}

/**
 * Apply the theme to the document root. `theme` is the mode (system/light/dark); `themeColor` is a hex
 * custom color or '' to follow the mode.
 */
export function applyTheme(theme: string, themeColor: string): void {
  const root = document.documentElement;
  // Always clear prior custom overrides first (switching color→mode must fully reset).
  for (const v of CUSTOM_VARS) root.style.removeProperty(v);

  if (themeColor !== '' && isHexColor(themeColor)) {
    const text = bestTextOn(themeColor);
    const towardLight = text === LIGHT_TEXT;
    // Keep the .dark class in sync so non-overridden tokens (success/error/…) stay sensible.
    root.classList.toggle('dark', towardLight);
    const set = (name: string, value: string): void => {
      root.style.setProperty(name, value);
    };
    set('--surface-base', themeColor);
    set('--surface-raised', shade(themeColor, towardLight ? 0.08 : -0.04));
    set('--surface-overlay', shade(themeColor, towardLight ? 0.14 : -0.08));
    set('--surface-sunken', shade(themeColor, towardLight ? 0.18 : -0.12));
    set('--text-primary', text);
    // Secondary text is the MINIMUM shade that still clears AA, which is what makes it read as muted
    // without the two fixed values the old code used — those measured 1.92:1 on a light custom colour.
    set('--text-secondary', shadeUntil(themeColor, towardLight, AA_TEXT));
    // Disabled text is exempt from 1.4.3 (inactive controls), but it still has to be perceivable.
    set('--text-disabled', shadeUntil(themeColor, towardLight, AA_NON_TEXT));
    set('--border', shade(themeColor, towardLight ? 0.2 : -0.14));
    set('--border-strong', shade(themeColor, towardLight ? 0.28 : -0.2));
    // Focus ring and the accent fill are non-text UI: 3:1 against the surface they sit on (1.4.11).
    const accent = accentFor(themeColor, towardLight);
    set('--border-focus', accent);
    set('--primary', accent);
    set('--primary-hover', shade(accent, towardLight ? 0.12 : -0.12));
    set('--primary-active', shade(accent, towardLight ? 0.2 : -0.2));
    // The label ON the accent fill contrasts with the ACCENT, not with the page surface.
    set('--primary-fg', bestTextOn(accent));
    // The brand cyan used as foreground has no meaning on a custom surface; solve for AA there too.
    set('--primary-on-surface', shadeUntil(themeColor, towardLight, AA_TEXT));
    return;
  }

  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  root.classList.toggle('dark', isDark);
}

/** What a custom theme colour actually resolves to, and how well it measures. */
export interface ThemeColorReport {
  surface: string;
  raised: string;
  text: string;
  secondaryText: string;
  accent: string;
  /** Contrast of the chosen body text against the surface. */
  textRatio: number;
  /** Contrast of the accent (focus ring, fills) against the surface. */
  accentRatio: number;
  /** Contrast of the label drawn ON the accent, against the accent. */
  accentLabelRatio: number;
}

/**
 * Resolve a custom theme colour the same way `applyTheme` does, and report the ratios it achieved.
 *
 * The picker's hint has always promised that "text contrast is chosen automatically", and the search
 * above does deliver it — but the screen never showed the result, so the promise was one the user had
 * to take on faith. This is the same derivation, read out instead of applied: a claim about contrast
 * that a person can check is worth more than one they cannot.
 *
 * Returns `null` for anything that is not a hex colour, which is the same input `applyTheme` ignores.
 */
export function describeThemeColor(themeColor: string): ThemeColorReport | null {
  if (!isHexColor(themeColor)) return null;
  const text = bestTextOn(themeColor);
  const towardLight = text === LIGHT_TEXT;
  const accent = accentFor(themeColor, towardLight);
  return {
    surface: themeColor,
    raised: shade(themeColor, towardLight ? 0.08 : -0.04),
    text,
    secondaryText: shadeUntil(themeColor, towardLight, AA_TEXT),
    accent,
    textRatio: contrastRatio(text, themeColor),
    accentRatio: contrastRatio(accent, themeColor),
    accentLabelRatio: contrastRatio(bestTextOn(accent), accent),
  };
}
