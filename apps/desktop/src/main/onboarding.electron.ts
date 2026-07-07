import type { BrowserWindow } from 'electron';
import { join } from 'node:path';
import PreferenceStore from '@tepegoz/preferences';

/**
 * Renderer-load helpers for a chrome window: the onboarding surface vs the normal browser chrome. Kept
 * dependency-light (no TabManager) so `browser-windows.ts` — which owns window creation, tab bootstrap,
 * and multi-window session restore — can import these without an import cycle.
 */

function loadRenderer(win: BrowserWindow, query?: Record<string, string>): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined && devUrl.length > 0) {
    const suffix = query === undefined ? '' : `?${new URLSearchParams(query).toString()}`;
    void win.loadURL(`${devUrl}${suffix}`);
  } else {
    void win.loadFile(
      join(__dirname, '../renderer/index.html'),
      query === undefined ? undefined : { query },
    );
  }
}

export function shouldShowOnboarding(): boolean {
  return !PreferenceStore.getAll().onboardingCompleted;
}

export function loadOnboarding(win: BrowserWindow): void {
  loadRenderer(win, { surface: 'onboarding' });
}

/** Load the normal browser chrome into `win`. Tab bootstrapping (restore/default) is the caller's
 *  concern (`browser-windows.ts`), so this only swaps the renderer surface. */
export function loadBrowser(win: BrowserWindow): void {
  loadRenderer(win);
}
