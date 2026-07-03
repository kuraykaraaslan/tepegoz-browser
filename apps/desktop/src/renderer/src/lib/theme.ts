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
] as const;

/** A valid 6-digit hex color, e.g. `#7c3aed`. */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance (0 = black, 1 = white) — used to decide light-vs-dark text. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
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
 * Apply the theme to the document root. `theme` is the mode (system/light/dark); `themeColor` is a hex
 * custom color or '' to follow the mode.
 */
export function applyTheme(theme: string, themeColor: string): void {
  const root = document.documentElement;
  // Always clear prior custom overrides first (switching color→mode must fully reset).
  for (const v of CUSTOM_VARS) root.style.removeProperty(v);

  if (themeColor !== '' && isHexColor(themeColor)) {
    const dark = luminance(themeColor) < 0.5;
    // Keep the .dark class in sync so non-overridden tokens (success/error/…) stay sensible.
    root.classList.toggle('dark', dark);
    const text = dark ? '#f8fafc' : '#0f172a';
    const set = (name: string, value: string): void => {
      root.style.setProperty(name, value);
    };
    set('--surface-base', themeColor);
    set('--surface-raised', shade(themeColor, dark ? 0.08 : -0.04));
    set('--surface-overlay', shade(themeColor, dark ? 0.14 : -0.08));
    set('--surface-sunken', shade(themeColor, dark ? 0.18 : -0.12));
    set('--text-primary', text);
    set('--text-secondary', dark ? '#cbd5e1' : '#475569');
    set('--text-disabled', dark ? '#7c93ac' : '#94a3b8');
    set('--border', shade(themeColor, dark ? 0.2 : -0.14));
    set('--border-strong', shade(themeColor, dark ? 0.28 : -0.2));
    const accent = shade(themeColor, dark ? 0.38 : -0.3);
    set('--border-focus', accent);
    set('--primary', accent);
    set('--primary-hover', shade(themeColor, dark ? 0.46 : -0.36));
    set('--primary-active', shade(themeColor, dark ? 0.54 : -0.42));
    set('--primary-fg', text);
    return;
  }

  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  root.classList.toggle('dark', isDark);
}
