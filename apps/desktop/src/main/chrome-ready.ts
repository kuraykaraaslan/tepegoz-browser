import type { BrowserWindow } from 'electron';
import { Logger } from '@tepegoz/libs';

/**
 * "The App chrome has mounted and laid itself out" — the one honest signal that the trusted UI is on
 * screen, not just that the renderer process started.
 *
 * It is the renderer's FIRST `setContentBounds` IPC carrying a real (non-zero) content rectangle
 * (`App-effects.ts` — a layout `useEffect` + `ResizeObserver` on the content area). That effect cannot
 * run until React has painted the real toolbar + tab strip, so it is strictly later than Electron's
 * `ready-to-show` (which can fire on an empty shell) and is what we want for two things:
 *
 *  1. Reveal the window on a COMPLETE first frame — chrome + page together — never the page alone in a
 *     frameless window with no visible UI ("sadece webview" — the thing that looked broken).
 *  2. Start the non-critical main-process init (`index.ts` `runDeferredInit`) in PARALLEL with the
 *     renderer parsing its bundle and mounting, instead of blocking the window's creation behind it.
 *
 * Listeners are one-shot. A wall-clock fallback in `index.ts` still arms the browser if a broken
 * renderer never signals, and `createWindow` keeps `did-finish-load` + a timeout as reveal fallbacks.
 */
type ChromeReadyListener = (win: BrowserWindow) => void;

const readyWindows = new WeakSet<BrowserWindow>();
const anyListeners = new Set<() => void>();
const perWindowListeners = new WeakMap<BrowserWindow, Set<ChromeReadyListener>>();
let anyReadySeen = false;

/** Called by the `tabsSetBounds` IPC handler the first time a chrome window reports a real content area. */
export function markChromeReady(win: BrowserWindow): void {
  if (readyWindows.has(win)) return;
  readyWindows.add(win);
  anyReadySeen = true;
  for (const listener of [...anyListeners]) {
    anyListeners.delete(listener);
    runSafely(() => listener());
  }
  const perWindow = perWindowListeners.get(win);
  if (perWindow !== undefined) {
    perWindowListeners.delete(win);
    for (const listener of perWindow) runSafely(() => listener(win));
  }
}

/** Run `listener` once when ANY chrome window first reports ready — immediately if one already has. */
export function whenAnyChromeReady(listener: () => void): void {
  if (anyReadySeen) {
    runSafely(listener);
    return;
  }
  anyListeners.add(listener);
}

/** Run `listener` once when THIS window first reports ready — immediately if it already has. */
export function whenChromeReady(win: BrowserWindow, listener: ChromeReadyListener): void {
  if (readyWindows.has(win)) {
    runSafely(() => listener(win));
    return;
  }
  let perWindow = perWindowListeners.get(win);
  if (perWindow === undefined) {
    perWindow = new Set();
    perWindowListeners.set(win, perWindow);
  }
  perWindow.add(listener);
}

function runSafely(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    // A listener that throws must not stop the others, nor take down the launch it is meant to speed up.
    Logger.error('chrome-ready listener threw', { err: String(err) });
  }
}
