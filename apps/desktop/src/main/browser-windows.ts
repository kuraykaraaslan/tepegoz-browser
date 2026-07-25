import type { BrowserWindow } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import { SessionStore } from '@tepegoz/persistence';
import { createWindow, effectiveStartupMode, hideToTray } from './window';
import TabManager from './tabs';
import { isQuitting } from './quit-state';
import { notifyHiddenToTrayOnce } from './tray';
import { reconcileTrayPowerBlocker } from './power-lifecycle';
import { handleWindowShortcut } from './keyboard-shortcuts';
import NotificationHost from './notifications/notification-host';
import PasswordHost from './password/password-host';
import AutofillHost from './password/autofill-host';
import { passwordVault } from './stores.electron';
import { getDb } from './db/database.electron';
import { loadBrowser, loadOnboarding, shouldShowOnboarding } from './onboarding.electron';

/**
 * Chrome-window lifecycle, shared by the startup path (`index.ts`) and the tab tear-off coordinator
 * (`tab-drag-coordinator.ts`). Kept out of `index.ts` so the coordinator can open a new window WITHOUT
 * importing the process entry point (whose top-level code must run exactly once).
 */

/** Whether the one-time session restore (which may reopen several windows) has already run this launch. */
let sessionBootstrapped = false;

/** How a freshly-opened window seeds its tabs. */
type TabBootstrap =
  | 'restore' // startup / onboarding-complete: restore the saved session (multi-window) or a default tab
  | 'default' // "New window": a single blank new-tab
  | 'none'; //   tear-off: the coordinator adopts the dragged tab, so open with no tabs

/** Wire the window-agnostic host singletons ONCE (they register global IPC handlers and resolve their
 *  target window — focused, or the navigating tab's owner — dynamically, so they must not be attached
 *  per-window). Call from `whenReady` after the stores are initialized. */
export function initHosts(): void {
  // Notification center: store→renderer broadcast + toast into the focused window.
  NotificationHost.attach();
  // Password manager: fill IPC handler + autofill push (hooks into TabManager navigation events).
  PasswordHost.attach();
  AutofillHost.attach(passwordVault);
}

/** Open a chrome browser window and register its tab manager. Callable N times (multi-window). `tabs`
 *  picks how it seeds tabs; an optional screen `position`/`size` places a torn-off / restored window. */
export function openWindow(opts?: {
  tabs?: TabBootstrap;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  /** Force a normal foreground window, ignoring the background/kiosk startup mode (a tray click that
   *  opens a fresh window after the last tab was closed). */
  foreground?: boolean;
}): BrowserWindow {
  const win = createWindow(opts?.foreground === true ? { forceForeground: true } : undefined);
  // Position/size BEFORE the window reveals (createWindow shows on ready-to-show) so a torn-off / restored
  // window appears where it belongs with no visible jump.
  if (opts?.size !== undefined) win.setSize(opts.size.width, opts.size.height);
  if (opts?.position !== undefined) win.setPosition(opts.position.x, opts.position.y);
  TabManager.register(win);
  // Start-in-background parks the window off-screen on its first reveal (see window.ts); once it's shown
  // (on- or off-screen), reconcile keep-awake so a start-parked window honors `keepAwakeInTray` too.
  win.once('show', () => {
    reconcileTrayPowerBlocker();
  });
  // App-level keyboard shortcuts (F11 fullscreen, kiosk exit) when the CHROME has focus. Web views wire
  // the same handler in tabs-view-wiring so the shortcuts also work while a page is focused (and in kiosk).
  win.webContents.on('before-input-event', (event, input) => {
    if (handleWindowShortcut(win, input)) event.preventDefault();
  });
  // Close-to-tray: the X button hides the window (keeping every tab rendering for the agent) instead of
  // closing/quitting. The pref is read LIVE so toggling needs no reconcile. Skipped when a real quit is
  // underway, in eval mode, when the pref is off, or when the window has no tabs left (e.g. the last tab
  // was just closed → let it close so the app can quit). Registered AFTER createWindow's bounds-persist
  // close handler, so the real on-screen placement is captured before we park the window off-screen.
  win.on('close', (event) => {
    if (isQuitting() || process.env.TEPEGOZ_EVAL === '1' || !PreferenceStore.getAll().closeToTray) return;
    if ((TabManager.forWindow(win)?.tabCount() ?? 0) === 0) return;
    event.preventDefault();
    hideToTray(win);
    notifyHiddenToTrayOnce();
    reconcileTrayPowerBlocker(); // start keep-awake if enabled + a window is now hidden
  });
  win.on('closed', () => {
    TabManager.persistNow(); // capture the final tab set BEFORE unregister clears the store
    TabManager.unregister(win);
  });
  const bootstrap: TabBootstrap = opts?.tabs ?? 'restore';
  const startup = opts?.foreground === true ? 'window' : effectiveStartupMode();
  // Kiosk is a locked deployment surface — it skips onboarding and loads the chromeless renderer + a
  // single tab pinned to the kiosk URL. Otherwise onboarding gates the first real browser surface.
  if (startup === 'kiosk' && bootstrap !== 'none') {
    loadBrowser(win, { kiosk: true });
    bootstrapKioskTab(win);
  } else if (bootstrap === 'restore' && shouldShowOnboarding()) {
    loadOnboarding(win);
  } else {
    loadBrowser(win);
    bootstrapTabs(win, bootstrap);
  }
  return win;
}

/** Kiosk seed: one tab pinned to the configured kiosk URL (or the new-tab page if unset, so a
 *  misconfigured kiosk isn't a blank screen). */
function bootstrapKioskTab(win: BrowserWindow): void {
  const wt = TabManager.forWindow(win);
  if (wt === undefined) return;
  const url = PreferenceStore.getAll().kioskUrl.trim();
  wt.createTab(url.length > 0 ? url : undefined);
}

/** Seed a just-loaded window's tabs per its bootstrap mode. */
function bootstrapTabs(win: BrowserWindow, mode: TabBootstrap): void {
  if (mode === 'none') return;
  const wt = TabManager.forWindow(win);
  if (wt === undefined) return;
  if (mode === 'default') {
    wt.createTab();
    return;
  }
  // 'restore' — only the first time this launch; subsequent restore-mode opens get a default tab.
  if (sessionBootstrapped) {
    wt.createTab();
    return;
  }
  sessionBootstrapped = true;
  if (!restoreSessionWindows(win)) wt.createTab();
}

/** Restore the saved multi-window session: the first window's tabs into `firstWin`, and one extra
 *  window per additional saved window. Returns true if the first window restored ≥1 tab. */
function restoreSessionWindows(firstWin: BrowserWindow): boolean {
  const db = getDb();
  if (db === null) return false;
  const snap = SessionStore.load(db);
  if (snap === null || snap.windows.length === 0) return false;

  const [first, ...rest] = snap.windows;
  const firstWt = TabManager.forWindow(firstWin);
  if (firstWt === undefined || first === undefined) return false;
  if (first.bounds !== undefined) firstWin.setBounds(first.bounds);
  const restoredFirst = firstWt.restoreWindow(first);

  for (const w of rest) {
    const extra = openWindow({
      tabs: 'none',
      ...(w.bounds !== undefined
        ? {
            position: { x: w.bounds.x, y: w.bounds.y },
            size: { width: w.bounds.width, height: w.bounds.height },
          }
        : {}),
    });
    TabManager.forWindow(extra)?.restoreWindow(w);
  }
  return restoredFirst;
}

/** Finish first-run onboarding: persist the flag, swap to the browser chrome, and seed its tabs. */
export function completeOnboarding(win: BrowserWindow): void {
  PreferenceStore.update({ onboardingCompleted: true });
  loadBrowser(win);
  bootstrapTabs(win, 'restore');
}
