import { app, BrowserWindow, shell, type Rectangle } from 'electron';
import { join } from 'node:path';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';
import { isTrustedAppUrl } from './lib/trusted-origin';
import { GLASS_BG, OPAQUE_BG, isMicaSupported } from './lib/glass';

/** App-chrome partition — shared by the main window and extension popups (both are trusted chrome).
 *  Exported for the CSP hook in security.ts (the policy applies to this session ONLY). */
export const APP_PARTITION = 'persist:tepegoz-app';
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
  // Windows 11 "glass": create the window with the Mica backdrop when supported + enabled. The renderer's
  // `.glass` styles make the shell/bars translucent so the material shows through (see lib/glass.ts).
  // `show:false` + reveal-on-paint (below) means the transparent fill never flashes the desktop.
  const glass = isMicaSupported() && PreferenceStore.getAll().glassChrome;
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    icon: ICON_PATH,
    // Brand navy (logo background) so the frame matches before the renderer paints; transparent under glass.
    backgroundColor: glass ? GLASS_BG : OPAQUE_BG,
    ...(glass ? { backgroundMaterial: 'mica' as const } : {}),
    // App-chrome gets its own persistent partition. Browsed (untrusted) pages run in SEPARATE isolated
    // partitions/WebContentsView, never sharing this session.
    webPreferences: { ...CHROME_WEB_PREFERENCES },
  });

  // Reveal the window robustly: prefer 'ready-to-show' (no white flash), but NEVER leave it stuck
  // hidden if that event is delayed or missed (e.g. a renderer load hiccup in dev). did-finish-load
  // and a timed fallback guarantee the window always appears. show() is idempotent.
  let shown = false;
  // The AI-1 eval harness launches the real app many times back-to-back; keep every launch OFF the
  // user's active view so a batch run never steals focus or pops windows while they work at the machine.
  const evalMode = process.env.TEPEGOZ_EVAL === '1';
  const reveal = (): void => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    if (evalMode) {
      // Invisible but FULLY COMPOSITED: a fully-transparent (opacity 0), shown-inactive window keeps
      // painting its surface — so render-DOM perception (`elementFromPoint` hit-testing) AND screenshots
      // still work — while the user sees nothing and focus is never stolen. Minimizing instead would stop
      // compositing and blind perception. Also moved off-screen as belt-and-suspenders.
      win.setOpacity(0);
      win.setPosition(-2400, -2400);
      win.showInactive();
      return;
    }
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

  // The OS window title (taskbar / Alt-Tab) reflects the ACTIVE TAB, not the chrome document — so
  // suppress Electron's auto-sync from the chrome's static <title>; TabManager owns the title.
  win.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  return win;
}

/**
 * Secure factory for an extension popup window: a frameless, non-resizable child of `parent`, sharing
 * the same trusted preload + app partition (so `window.tepegoz` works and the IPC sender allow-list
 * accepts it). It floats above the parent's native web view, so the browsed page stays live behind it.
 * The caller loads the renderer with `?surface=<kind>` and manages show/close (blur-to-dismiss).
 *
 * `backgroundColor` is the resolved theme surface color (see resolveSurfaceTheme) so the window's first
 * paint matches the active theme — a hardcoded navy default would flash before the renderer applies a
 * light/custom theme. Defaults to brand navy for callers that don't resolve one.
 */
export function createPopupWindow(
  parent: BrowserWindow,
  bounds: Rectangle,
  backgroundColor = '#0c2135',
): BrowserWindow {
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
    backgroundColor,
    webPreferences: { ...CHROME_WEB_PREFERENCES },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url)) event.preventDefault();
  });
  return win;
}

/**
 * Secure factory for the tab tear-off DRAG PREVIEW window: a small, frameless, transparent,
 * click-through, always-on-top chip that follows the cursor across the desktop while a tab/group is
 * dragged out of its strip. Click-through (`setIgnoreMouseEvents`) + non-focusable so it never captures
 * the pointer nor steals focus — the source window keeps drag ownership; main just repositions this. The
 * caller loads the renderer with `?surface=drag-preview` and drives show/move/close.
 */
export function createDragPreviewWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 232,
    height: 40,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    // No backgroundColor — the surface paints its own translucent chip over the transparent window.
    webPreferences: { ...CHROME_WEB_PREFERENCES },
  });
  win.setMenu(null);
  // Float above everything (incl. fullscreen) and never intercept the pointer while it tracks the cursor.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url)) event.preventDefault();
  });
  return win;
}
