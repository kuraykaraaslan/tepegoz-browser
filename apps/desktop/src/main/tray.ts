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

function buildTrayMenu(): Menu {
  const t = mainStrings();
  return Menu.buildFromTemplate([
    { label: t.browser.trayShow, click: () => revealAllWindows() },
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
  tray.setToolTip(mainStrings().browser.trayTooltip);
  tray.setContextMenu(buildTrayMenu());
  // Windows/Linux convention: a single or double left-click on the tray icon shows the app (as a normal
  // foreground window). Right-click opens the menu (Show / Quit).
  tray.on('click', () => revealAllWindows());
  tray.on('double-click', () => revealAllWindows());
}

/** Rebuild the tray menu + tooltip after a locale change (called from the prefs reconcile). */
export function refreshTray(): void {
  if (tray === null) return;
  tray.setToolTip(mainStrings().browser.trayTooltip);
  tray.setContextMenu(buildTrayMenu());
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
