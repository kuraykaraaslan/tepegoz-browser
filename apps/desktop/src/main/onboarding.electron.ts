import type { BrowserWindow } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import { chromeFilePath } from './chrome-url';

/**
 * Renderer-load helpers for a chrome window: the onboarding surface vs the normal browser chrome. Kept
 * dependency-light (no TabManager) so `browser-windows.ts` — which owns window creation, tab bootstrap,
 * and multi-window session restore — can import these without an import cycle.
 */

/**
 * Load the chrome into a window. THE single place that decides where chrome HTML comes from: the Vite
 * dev server when it is running, `app://chrome` otherwise. Exported because the popup and tab-drag
 * windows used to carry their own copy of this branch — three copies of "which URL is our own UI" is
 * three chances to disagree with `isTrustedAppUrl`.
 */
export function loadChrome(win: BrowserWindow, query?: Record<string, string>): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined && devUrl.length > 0) {
    const suffix = query === undefined ? '' : `?${new URLSearchParams(query).toString()}`;
    void win.loadURL(`${devUrl}${suffix}`);
    return;
  }
  void win.loadFile(chromeFilePath(), query === undefined ? undefined : { query });
}

function loadRenderer(win: BrowserWindow, query?: Record<string, string>): void {
  loadChrome(win, query);
}

export function shouldShowOnboarding(): boolean {
  return !PreferenceStore.getAll().onboardingCompleted;
}

export function loadOnboarding(win: BrowserWindow): void {
  loadRenderer(win, { surface: 'onboarding' });
}

/** Load the browser chrome into `win`. Tab bootstrapping (restore/default) is the caller's concern
 *  (`browser-windows.ts`), so this only swaps the renderer surface. `kiosk` loads a CHROMELESS variant
 *  (`?kiosk=1`) — the renderer hides the tab strip/toolbar and lets the web view fill the screen. */
export function loadBrowser(win: BrowserWindow, opts?: { kiosk?: boolean }): void {
  loadRenderer(win, opts?.kiosk === true ? { kiosk: '1' } : undefined);
}
