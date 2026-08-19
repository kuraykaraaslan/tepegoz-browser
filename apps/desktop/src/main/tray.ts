import { app, Menu, nativeImage, Notification, Tray } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import { mainStrings } from './lib/i18n-main';
import TabManager from './tabs';
import { ICON_PATH, showFromTray } from './window';
import { markQuitting } from './quit-state';
import { reconcileTrayPowerBlocker } from './power-lifecycle';

/**
 * The system-tray icon: keeps the app reachable while every chrome window is hidden to the tray
 * (close-to-tray). Its menu is the ONLY user-facing real-quit path besides the main-menu "Exit" — quit
 * hides→shows are deliberately decoupled (see quit-state.ts) so background tabs keep rendering. Windows/
 * Linux show a tray icon; on macOS this is a menu-bar item. Created once from the app entry.
 */
let tray: Tray | null = null;

/** Bring every chrome window back on-screen (from the tray or a minimize) and focus the last-focused one.
 *  Shared by the tray "Show" item, a tray click, and the second-instance handler. */
export function revealAllWindows(): void {
  for (const wt of TabManager.all()) showFromTray(wt.window);
  TabManager.focusedWindow()?.focus();
  reconcileTrayPowerBlocker(); // no window is hidden anymore → stop keep-awake
}

/**
 * Tray-triggered "open the app": reveal existing windows, or open a FRESH one (with a new tab) when none
 * exist — e.g. after the last tab was closed while running in the background (close-to-tray). The dynamic
 * import breaks the tray ↔ browser-windows static cycle.
 */
function showOrOpenApp(): void {
  if (TabManager.all().length > 0) {
    revealAllWindows();
    return;
  }
  void import('./browser-windows').then((m) => {
    m.openWindow({ foreground: true }); // a tray click always opens a visible window, even in background mode
  });
}

function buildTrayMenu(): Menu {
  const t = mainStrings();
  return Menu.buildFromTemplate([
    { label: t.browser.trayShow, click: () => showOrOpenApp() },
    { type: 'separator' },
    {
      label: t.browser.trayQuit,
      click: () => {
        markQuitting(); // real quit → the window close-interceptor lets windows close (before-quit persists)
        app.quit();
      },
    },
  ]);
}

/** Create the tray icon once (idempotent). Called from the app entry after the first window opens. */
export function initTray(): void {
  if (tray !== null) return;
  tray = new Tray(nativeImage.createFromPath(ICON_PATH));
  tray.setToolTip(tooltip());
  tray.setContextMenu(buildTrayMenu());
  // Windows/Linux convention: a single or double left-click on the tray icon shows the app (a fresh
  // window with a new tab if none exist). Right-click opens the menu (Show / Quit).
  tray.on('click', () => showOrOpenApp());
  tray.on('double-click', () => showOrOpenApp());
}

/** Rebuild the tray menu + tooltip after a locale change (called from the prefs reconcile). */
export function refreshTray(): void {
  if (tray === null) return;
  tray.setToolTip(tooltip());
  tray.setContextMenu(buildTrayMenu());
}

/**
 * Whether an agent run currently holds the lock. Pushed in from the run path rather than imported
 * from it: the tray is a leaf the app entry initialises, and reaching into the agent run lock from
 * here would tie the system-tray icon to the agent module graph.
 */
let agentRunning = false;

function tooltip(): string {
  const t = mainStrings().browser;
  return agentRunning ? t.trayAgentRunning : t.trayTooltip;
}

/**
 * Reflect an agent run in the tray (S8 PR5).
 *
 * The indicator matters most in exactly the state where the panel cannot serve as one: the window
 * parked off-screen with the run still going. "Working" and "quietly stopped" must not look the same
 * from outside, and the tray is the one surface that survives the window being gone.
 */
export function setTrayAgentRunning(running: boolean): void {
  if (agentRunning === running) return;
  agentRunning = running;
  if (tray !== null) tray.setToolTip(tooltip());
}

/** Show a native "still running in the tray" notification the FIRST time a window hides to the tray, so
 *  the default-on close-to-tray behavior isn't a surprise. Remembered in prefs so it never nags again. */
export function notifyHiddenToTrayOnce(): void {
  if (PreferenceStore.getAll().trayHintShown) return;
  PreferenceStore.update({ trayHintShown: true });
  if (!Notification.isSupported()) return;
  const t = mainStrings();
  new Notification({ title: t.browser.trayTooltip, body: t.browser.trayRunning }).show();
}
