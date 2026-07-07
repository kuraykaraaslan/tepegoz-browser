import type { BrowserWindow } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import { SessionStore } from '@tepegoz/persistence';
import { createWindow } from './window';
import TabManager from './tabs';
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
}): BrowserWindow {
  const win = createWindow();
  // Position/size BEFORE the window reveals (createWindow shows on ready-to-show) so a torn-off / restored
  // window appears where it belongs with no visible jump.
  if (opts?.size !== undefined) win.setSize(opts.size.width, opts.size.height);
  if (opts?.position !== undefined) win.setPosition(opts.position.x, opts.position.y);
  TabManager.register(win);
  win.on('closed', () => {
    TabManager.persistNow(); // capture the final tab set BEFORE unregister clears the store
    TabManager.unregister(win);
  });
  const mode: TabBootstrap = opts?.tabs ?? 'restore';
  // Onboarding only gates the very first real browser surface; restore-mode windows show it if pending.
  if (mode === 'restore' && shouldShowOnboarding()) {
    loadOnboarding(win);
  } else {
    loadBrowser(win);
    bootstrapTabs(win, mode);
  }
  return win;
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
