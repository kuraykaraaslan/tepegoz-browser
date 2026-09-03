import type { BrowserWindow } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import { Logger } from '@tepegoz/libs';
import { chromeFilePath } from './chrome-url';

/**
 * Renderer-load helpers for a chrome window: the onboarding surface vs the normal browser chrome. Kept
 * dependency-light (no TabManager) so `browser-windows.ts` — which owns window creation, tab bootstrap,
 * and multi-window session restore — can import these without an import cycle.
 */

/** Dev-server load retry. A window opened AFTER startup — a popup, a submenu flyout, the tab-drag
 *  preview — can hit the Vite dev server mid dependency re-optimization or preload-rebuild reload, when
 *  it briefly refuses the connection; the already-loaded main window never sees this. A couple of quick
 *  retries turn that blip into a slightly slower open instead of a dead window. Prod loads from disk and
 *  never retries. */
const DEV_LOAD_ATTEMPTS = 3;
const DEV_LOAD_RETRY_MS = 150;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Load the chrome into a window. THE single place that decides where chrome HTML comes from: the Vite
 * dev server when it is running, the bundled file otherwise. The popup (`popup-window.ts`) and tab-drag
 * (`tab-drag-coordinator.ts`) windows call this too — three copies of "which URL is our own UI" is
 * three chances to disagree with `isTrustedAppUrl`.
 *
 * The dev URL is normalised to `http://host:port/?query`: electron-vite hands us the bare origin with
 * no trailing slash, so the old `${devUrl}?${q}` produced `http://host:port?query` — an authority
 * followed straight by `?`. Rejects only after every dev retry is exhausted; a caller that wants to
 * surface the failure attaches its own `.catch`.
 */
export async function loadChrome(win: BrowserWindow, query?: Record<string, string>): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined && devUrl.length > 0) {
    const search = query === undefined ? '' : new URLSearchParams(query).toString();
    const base = devUrl.endsWith('/') ? devUrl : `${devUrl}/`;
    const url = search.length > 0 ? `${base}?${search}` : base;
    for (let attempt = 1; attempt <= DEV_LOAD_ATTEMPTS; attempt += 1) {
      if (win.isDestroyed()) return;
      try {
        await win.loadURL(url);
        return;
      } catch (err) {
        if (win.isDestroyed()) return; // window closed while we were loading — nobody to tell
        if (attempt >= DEV_LOAD_ATTEMPTS) throw err;
        Logger.warn('Chrome dev-server load failed, retrying', { attempt, err: String(err) });
        await delay(DEV_LOAD_RETRY_MS);
      }
    }
  }
  await win.loadFile(chromeFilePath(), query === undefined ? undefined : { query });
}

function loadRenderer(win: BrowserWindow, query?: Record<string, string>): void {
  void loadChrome(win, query);
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
