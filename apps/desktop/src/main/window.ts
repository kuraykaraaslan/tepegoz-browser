import { app, BrowserWindow, screen, shell, type Rectangle } from 'electron';
import { join } from 'node:path';
import { IpcChannels, type StartupMode, type WindowBounds } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';
import { isTrustedAppUrl } from './lib/trusted-origin';
import { PARK_X, PARK_Y, isParkedToTray, trayParked } from './window-parked';
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

// Default main-window size for a fresh profile (no saved placement yet). The window opens OS-centered.
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 854;
const MIN_WINDOW_WIDTH = 640;
const MIN_WINDOW_HEIGHT = 427;

/**
 * True when the saved rectangle still lands on a currently-connected display. Guards against restoring a
 * window onto a monitor that was unplugged/rearranged since last launch (it would open off-screen and be
 * unreachable). We require a real chunk of the title bar to fall inside some display's work area (not just
 * a 1px touch), so a barely-overlapping ghost still counts as off-screen → falls back to the primary screen.
 */
function isBoundsOnScreen(b: WindowBounds): boolean {
  return screen.getAllDisplays().some((display) => {
    const wa = display.workArea;
    const overlapW = Math.min(b.x + b.width, wa.x + wa.width) - Math.max(b.x, wa.x);
    const overlapH = Math.min(b.y + b.height, wa.y + wa.height) - Math.max(b.y, wa.y);
    return overlapW >= 100 && overlapH >= 50;
  });
}

// Brand app icon (generated from resources/icon.svg via `pnpm --filter @tepegoz/desktop icons`).
// Windows favors the multi-resolution .ico; other platforms use the 512px PNG. Exported so the tray
// (tray.ts) uses the same brand image.
export const ICON_PATH = join(
  app.getAppPath(),
  'resources',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png',
);

// ── Close-to-tray ────────────────────────────────────────────────────────────────────────────────────
/** Off-desktop coordinates that "hide" a window to the tray while keeping it SHOWN — far outside any
 *  real display, so it's invisible but its compositor keeps running (every tab keeps rendering). */

/** Real (on-screen) bounds saved when a window is parked to the tray, so `showFromTray` can restore them. */


// The parked-window registry lives in `./window-parked` — a leaf other modules can ask without
// importing this file's Electron `app` usage. Re-exported so existing importers are unaffected.
export { isParkedToTray };

/**
 * Hide a window to the system tray. It stays SHOWN but is moved fully off-screen and removed from the
 * taskbar — deliberately NOT `win.hide()`, which flips the page to `visibilityState: hidden` and pauses
 * the compositor, blinding the agent's perception of every tab. Off-screen-but-shown keeps the renderer
 * painting (the same state the keep-rendering switches in the app entry rely on).
 */
export function hideToTray(win: BrowserWindow): void {
  if (win.isDestroyed() || trayParked.has(win)) return;
  trayParked.set(win, win.getBounds());
  win.setSkipTaskbar(true);
  win.setPosition(PARK_X, PARK_Y);
}

/**
 * Launch a window straight into the tray (start-in-background): shown OFF-SCREEN (so the compositor runs
 * and every tab renders from the start) but dropped from the taskbar, its real placement saved for
 * `showFromTray`. Unlike `hideToTray`, it `showInactive()`s the never-yet-shown window (off-screen,
 * unfocused) rather than assuming it is already visible.
 */
export function startParkedInTray(win: BrowserWindow): void {
  if (win.isDestroyed() || trayParked.has(win)) return;
  trayParked.set(win, win.getBounds()); // the placement it would have opened at, restored on showFromTray
  win.setPosition(PARK_X, PARK_Y);
  win.setSkipTaskbar(true);
  win.showInactive(); // shown (compositor active) but off-screen + unfocused
}

/**
 * Bring a tray-hidden / background-started window back as a normal FOREGROUND window: restore its saved
 * on-screen bounds + taskbar entry, and raise it above everything. A plain `focus()` from a tray click
 * is a background-process activation, which Windows' foreground-lock ignores — so the window would come
 * back on-screen but stuck BEHIND other apps. Flashing always-on-top forces it to the actual front.
 */
export function showFromTray(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const saved = trayParked.get(win);
  if (saved !== undefined) {
    win.setBounds(saved); // move back on-screen from the off-screen park
    trayParked.delete(win);
  }
  win.setSkipTaskbar(false);
  if (win.isMinimized()) win.restore();
  win.setAlwaysOnTop(true);
  win.show();
  win.focus();
  win.moveTop();
  win.setAlwaysOnTop(false); // relinquish — it just needed the kick to the front
}

/**
 * The startup presentation mode for this launch: normally the `startupMode` pref, but the dev/CLI
 * `TEPEGOZ_START_BACKGROUND=1` env or `--background` switch forces `background` without touching the pref.
 */
export function effectiveStartupMode(): StartupMode {
  if (
    process.env.TEPEGOZ_START_BACKGROUND === '1' ||
    app.commandLine.hasSwitch('background') ||
    process.argv.includes('--background')
  ) {
    return 'background';
  }
  return PreferenceStore.getAll().startupMode;
}

/** Present a window as a fullscreen locked kiosk (its renderer is loaded chromeless separately). */
export function enterKiosk(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.show();
  win.setKiosk(true);
  win.focus();
}

/** Leave kiosk at the window level (the caller reloads the normal chrome + un-parks if needed). */
export function exitKioskWindow(win: BrowserWindow): void {
  if (!win.isDestroyed()) win.setKiosk(false);
}

/** Toggle the window between fullscreen and windowed (F11 / the View menu). No-op in kiosk. */
export function toggleFullScreen(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isKiosk()) return;
  win.setFullScreen(!win.isFullScreen());
}

/**
 * The SINGLE secure window factory (internal-ai-rules BLOCKING): every BrowserWindow is created here
 * with contextIsolation + sandbox + nodeIntegration:false + webSecurity:true. New-window requests are
 * denied by default; external https is handed to the OS browser.
 *
 * Frameless (`frame: false`) — the chrome (title + minimize/maximize/close) is rendered by the
 * renderer (browser-style custom title bar). The draggable region uses CSS `-webkit-app-region: drag`,
 * which also restores OS caption behaviors (snap, double-click-to-maximize, system menu).
 */
export function createWindow(opts?: { forceForeground?: boolean }): BrowserWindow {
  // Windows 11 "glass": create the window with the Mica backdrop when supported + enabled. The renderer's
  // `.glass` styles make the shell/bars translucent so the material shows through (see lib/glass.ts).
  // `show:false` + reveal-on-paint (below) means the transparent fill never flashes the desktop.
  const glass = isMicaSupported() && PreferenceStore.getAll().glassChrome;
  // The AI-1 eval harness launches the real app many times back-to-back; keep every launch OFF the
  // user's active view (see `reveal`) and OFF the persisted placement so a batch run is deterministic.
  const evalMode = process.env.TEPEGOZ_EVAL === '1';

  // Restore the last placement — but never in eval mode (batch launches must be deterministic + fully
  // on-screen), and never when the saved rectangle lands on a display that is no longer connected: in
  // that case we drop x/y so Electron centers the window on the primary screen ("open on the first
  // screen"), keeping the remembered size. `maximized` is applied after creation.
  const saved = evalMode ? null : PreferenceStore.getAll().windowBounds;
  let placement: Partial<Rectangle>;
  if (saved === null) {
    placement = { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT };
  } else if (isBoundsOnScreen(saved)) {
    placement = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
  } else {
    // Saved monitor is gone → keep the remembered size but let Electron center it on the primary screen.
    placement = { width: saved.width, height: saved.height };
  }

  const win = new BrowserWindow({
    ...placement,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
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

  // Reopen maximized if that is how the user left it (the restored bounds above become the un-maximize
  // target). Skipped in eval mode, which never restores a placement.
  if (saved?.maximized) win.maximize();

  // Reveal the window robustly: prefer 'ready-to-show' (no white flash), but NEVER leave it stuck
  // hidden if that event is delayed or missed (e.g. a renderer load hiccup in dev). did-finish-load
  // and a timed fallback guarantee the window always appears. show() is idempotent.
  let shown = false;
  const reveal = (): void => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    if (evalMode) {
      // Shown INACTIVE: a normal, fully on-screen window (identical rendering to production, so perception
      // has no compositing warm-up race) that simply never grabs the foreground — so a batch eval run does
      // not steal focus while the user works. (Hiding/minimizing/opacity-0/off-screen all risk pausing or
      // racing the compositor, which blinds render-DOM perception — verified empirically.)
      win.showInactive();
      return;
    }
    // Present per the startup mode (applies to EVERY launch — manual or at login). `background` parks the
    // window off-screen (shown, so its compositor keeps every tab rendering) — the RELIABLE dev trigger is
    // `TEPEGOZ_START_BACKGROUND=1` (a CLI `--background` is eaten by npm/turbo). `kiosk` goes fullscreen +
    // locked; its chromeless renderer + kiosk-URL tab are set up by browser-windows. `forceForeground`
    // (a tray click that opens a fresh window) always shows normally, ignoring background/kiosk.
    const mode = opts?.forceForeground === true ? 'window' : effectiveStartupMode();
    if (mode === 'background') {
      startParkedInTray(win);
      return;
    }
    if (mode === 'kiosk') {
      enterKiosk(win);
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

  // Remember the window placement across launches. `getNormalBounds()` returns the RESTORED rectangle
  // (ignoring the maximized/minimized frame), so we always persist a sane un-maximize target alongside
  // the maximized flag. Eval launches are excluded (deterministic batch runs must not mutate prefs).
  // Move/resize fire rapidly while dragging, so persistence is debounced onto a short timer.
  if (!evalMode) {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const persistBounds = (): void => {
      // Skip minimized (bounds meaningless) and tray-parked (off-screen sentinel) windows — persisting
      // the parked position would corrupt the saved placement.
      if (win.isDestroyed() || win.isMinimized() || isParkedToTray(win)) return;
      const b = win.getNormalBounds();
      PreferenceStore.update({
        windowBounds: {
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          maximized: win.isMaximized(),
        },
      });
    };
    const scheduleSave = (): void => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persistBounds, 400);
    };
    win.on('resize', scheduleSave);
    win.on('move', scheduleSave);
    win.on('maximize', scheduleSave);
    win.on('unmaximize', scheduleSave);
    // Flush synchronously on close so the final placement is never lost to a pending debounce timer.
    win.on('close', () => {
      if (saveTimer) clearTimeout(saveTimer);
      persistBounds();
    });
  }

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
