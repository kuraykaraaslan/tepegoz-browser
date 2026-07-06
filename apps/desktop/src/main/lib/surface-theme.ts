import { nativeTheme } from 'electron';
import PreferenceStore from '@tepegoz/preferences';

/**
 * Resolve a popup's FIRST-PAINT surface color from persisted prefs, so a native popup window (and its
 * pre-mount HTML) paints the right color instead of a hardcoded navy that flashes on a light/custom
 * theme. Mirrors the renderer's `applyTheme()` surface-base selection (lib/theme.ts): a valid custom
 * `themeColor` IS the surface; otherwise the mode picks the brand light/dark surface token.
 */

/** Brand `--surface-base` tokens — mirror packages/ui/styles/tokens.css (`:root` vs `.dark`). Brand
 *  constants, changed rarely; kept in sync by hand. */
const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#0c2135';

/** A valid 6-digit hex color, e.g. `#7c3aed` (same check as renderer isHexColor). */
const HEX = /^#[0-9a-fA-F]{6}$/;

export interface SurfaceTheme {
  /** Resolved `--surface-base` for the current prefs — use as the native window backgroundColor. */
  color: string;
  /** Mode (system/light/dark), forwarded so the renderer applies the theme BEFORE React mounts. */
  theme: string;
  /** Custom hex color or '' — forwarded alongside `theme`. */
  themeColor: string;
}

export function resolveSurfaceTheme(): SurfaceTheme {
  const { theme, themeColor } = PreferenceStore.getAll();
  if (themeColor !== '' && HEX.test(themeColor)) {
    return { color: themeColor, theme, themeColor };
  }
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return { color: dark ? DARK_SURFACE : LIGHT_SURFACE, theme, themeColor };
}
