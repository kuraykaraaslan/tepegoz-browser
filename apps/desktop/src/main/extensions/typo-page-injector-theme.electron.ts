import { nativeTheme } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import { TYPO_CSS } from './typo-page-injector-styles.electron';

const LIGHT_PRIMARY = '#06AEC4';
const DARK_PRIMARY = '#22C6DA';
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

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

function typoUnderlineColor(): string {
  const { theme, themeColor } = PreferenceStore.getAll();
  if (HEX_COLOR_RE.test(themeColor)) {
    const dark = luminance(themeColor) < 0.5;
    return shade(themeColor, dark ? 0.38 : -0.3);
  }
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? DARK_PRIMARY : LIGHT_PRIMARY;
}

export function typoCss(): string {
  return `:root { --tepegoz-typo-underline: ${typoUnderlineColor()}; }\n${TYPO_CSS}`;
}
