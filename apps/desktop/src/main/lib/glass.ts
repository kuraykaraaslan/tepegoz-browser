import { release } from 'node:os';
import type { BrowserWindow } from 'electron';

/**
 * Windows 11 "glass" (Mica) chrome support + live application.
 *
 * Electron's `backgroundMaterial: 'mica'` composites the DWM backdrop only where the window's painted
 * content is NON-opaque — so the effect requires (a) a translucent `backgroundColor` (alpha < 0xFF) here
 * AND (b) a transparent renderer shell + translucent chrome bars (see the `.glass` CSS). It does NOT need
 * `transparent: true`, which would disable the DWM host, native shadow, and rounded corners.
 *
 * Mica is a Windows 11 feature. `os.release()` reports the NT kernel version (e.g. '10.0.22631'); Win11
 * is build >= 22000. Non-Win11 / non-Windows falls back to the opaque brand navy.
 */

/** Translucent window fill (fully transparent) so Mica shows through the renderer's glass surfaces. */
export const GLASS_BG = '#00000000';
/** Opaque brand navy — the non-glass fallback (matches createWindow's historical backgroundColor). */
export const OPAQUE_BG = '#0c2135';

/** First Windows 11 build (21H2). Mica `backgroundMaterial` is supported from here on. */
const WIN11_MIN_BUILD = 22000;

/** True when the OS can render the Mica backdrop (Windows 11+). */
export function isMicaSupported(): boolean {
  if (process.platform !== 'win32') return false;
  // release() → 'major.minor.build'; the build number is the third segment.
  const build = Number.parseInt(release().split('.')[2] ?? '', 10);
  return Number.isFinite(build) && build >= WIN11_MIN_BUILD;
}

/**
 * Apply (or remove) the Mica glass backdrop on a chrome window, live. Safe to call on any platform:
 * when unsupported or disabled it restores an opaque fill. No-op on a destroyed window.
 *
 * `opaqueColor` is the non-glass ground — pass the ACTIVE theme's surface (`resolveSurfaceTheme`), which
 * is what the window shows until the renderer paints. It stays a parameter rather than a lookup so this
 * module keeps no dependency on the preference store (and stays unit-testable without an Electron
 * environment); the brand navy is only the fallback for a caller that has no resolved colour.
 */
export function applyChromeGlass(
  win: BrowserWindow,
  enabled: boolean,
  opaqueColor: string = OPAQUE_BG,
): void {
  if (win.isDestroyed()) return;
  if (isMicaSupported() && enabled) {
    win.setBackgroundColor(GLASS_BG);
    win.setBackgroundMaterial('mica');
  } else {
    win.setBackgroundMaterial('none');
    win.setBackgroundColor(opaqueColor);
  }
}
