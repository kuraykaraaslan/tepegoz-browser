import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { IpcChannels } from '../shared/ipc-contract';
import { isTrustedAppUrl } from './lib/trusted-origin';

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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      // App-chrome gets its own persistent partition. Browsed (untrusted) pages will later run in
      // SEPARATE isolated partitions/WebContentsView, never sharing this session.
      partition: 'persist:tepegoz-app',
    },
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
