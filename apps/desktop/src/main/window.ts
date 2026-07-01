import { app, BrowserWindow, shell, type Rectangle } from 'electron';
import { join } from 'node:path';
import { IpcChannels } from '../shared/ipc-contract';
import { isTrustedAppUrl } from './lib/trusted-origin';

/** App-chrome partition — shared by the main window and extension popups (both are trusted chrome). */
const APP_PARTITION = 'persist:tepegoz-app';
/** Secure webPreferences shared by every chrome window (internal-ai-rules BLOCKING: one config). */
const CHROME_WEB_PREFERENCES = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  spellcheck: false,
  partition: APP_PARTITION,
} as const;

// Brand app icon (generated from resources/icon.svg via `pnpm --filter @tepegoz/desktop icons`).
// Windows favors the multi-resolution .ico; other platforms use the 512px PNG.
const ICON_PATH = join(
  app.getAppPath(),
  'resources',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png',
);

/**
 * The SINGLE secure window factory (internal-ai-rules BLOCKING): every BrowserWindow is created here
 * with contextIsolation + sandbox + nodeIntegration:false + webSecurity:true. New-window requests are
 * denied by default; external https is handed to the OS browser.
 *
 * Frameless (`frame: false`) — the chrome (title + minimize/maximize/close) is rendered by the
 * renderer (browser-style custom title bar). The draggable region uses CSS `-webkit-app-region: drag`,
 * which also restores OS caption behaviors (snap, double-click-to-maximize, system menu).
 */
export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    icon: ICON_PATH,
    // Brand navy (logo background) so the frame matches before the renderer paints.
    backgroundColor: '#0c2135',
    // App-chrome gets its own persistent partition. Browsed (untrusted) pages run in SEPARATE isolated
    // partitions/WebContentsView, never sharing this session.
    webPreferences: { ...CHROME_WEB_PREFERENCES },
  });

  // Reveal the window robustly: prefer 'ready-to-show' (no white flash), but NEVER leave it stuck
  // hidden if that event is delayed or missed (e.g. a renderer load hiccup in dev). did-finish-load
  // and a timed fallback guarantee the window always appears. show() is idempotent.
  let shown = false;
  const reveal = (): void => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.show();
    win.focus();
  };
  win.once('ready-to-show', reveal);
  win.webContents.once('did-finish-load', reveal);
  setTimeout(reveal, 4000);

  // Keep the renderer's maximize/restore button in sync with the actual window state (covers
  // OS-driven changes too: double-click caption, Win+Up snap, etc.).
  const emitMaximized = (): void => {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.windowMaximizedChanged, win.isMaximized());
    }
  };
  win.on('maximize', emitMaximized);
  win.on('unmaximize', emitMaximized);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // The chrome window is locked to app content — it must never navigate to web/arbitrary URLs
  // (browsed pages live in separate WebContentsViews, governed by TabManager).
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url)) {
      event.preventDefault();
    }
  });

  return win;
}

/**
 * Secure factory for an extension popup window: a frameless, non-resizable child of `parent`, sharing
 * the same trusted preload + app partition (so `window.tepegoz` works and the IPC sender allow-list
 * accepts it). It floats above the parent's native web view, so the browsed page stays live behind it.
 * The caller loads the renderer with `?popup=<id>` and manages show/close (blur-to-dismiss).
 */
export function createPopupWindow(parent: BrowserWindow, bounds: Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    parent,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#0c2135',
    webPreferences: { ...CHROME_WEB_PREFERENCES },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url)) event.preventDefault();
  });
  return win;
}
