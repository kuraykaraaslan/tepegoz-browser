import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import { Logger } from '@tepegoz/libs';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { createPopupWindow } from './window';

/**
 * Owns THE popup window(s) — native, frameless child windows that float above the browsed page (which
 * stays live behind them), anchored under a toolbar control. Each reuses the main renderer bundle via a
 * `?surface=<kind>` marker (see the renderer entry) so it renders only that surface, with the same
 * trusted `window.tepegoz` bridge. Dismissed by losing focus (click-away), Escape, or re-triggering.
 *
 * Two layers:
 *  - the PRIMARY popup (extension popup / main menu), keyed for the single-instance + toggle guard;
 *  - an optional SUB popup (a submenu flyout) opened to the LEFT of the primary. A native window can't
 *    overflow its own bounds, so a submenu that must appear beside the menu has to be its own window.
 *    The sub is shown *inactive* (so opening it doesn't blur/close the primary), and the primary's
 *    click-away close ignores focus moving to the sub. Closing the primary cascades to the sub.
 *
 * Generalized from the extension-only popup manager so any surface can reuse the same primitive.
 */
const DEFAULT_WIDTH = 360;
const DEFAULT_MAX_HEIGHT = 520;
const MIN_HEIGHT = 160;
const GAP = 6;
const SUBMENU_WIDTH = 260;
/** Ignore an open that lands right after a blur-close of the SAME key (re-trigger = toggle-off). */
const REOPEN_GUARD_MS = 250;
/** Debounce a blur before acting, so focus can settle on the sub window (or elsewhere) first. */
const BLUR_CLOSE_MS = 90;

export interface OpenPopupOptions {
  parent: BrowserWindow;
  /** Identity for the single-instance + toggle guard (e.g. 'main-menu' or `ext:<id>`). */
  key: string;
  /** Query params appended to the renderer URL so the bootstrap renders the right surface. */
  query: Record<string, string>;
  /** Anchor rect (window-content DIP) the popup is placed under, right-aligned (opens leftward). */
  anchor: Rectangle;
  /** Popup width (px). Defaults to 360. */
  width?: number;
  /** Desired content height (px); clamped to the display work area. Defaults to a 520px cap. */
  height?: number;
}

export interface OpenSubmenuOptions {
  /** Query params for the sub surface (e.g. `{ surface: 'menu-sub', kind: 'history' }`). */
  query: Record<string, string>;
  /** The flyout parent row's rect, in the PRIMARY popup's content viewport (for vertical alignment). */
  anchor: Rectangle;
  /** Desired content height (px). */
  height?: number | undefined;
}

export default class PopupWindowManager {
  private static win: BrowserWindow | null = null;
  private static subWin: BrowserWindow | null = null;
  private static openKey: string | null = null;
  private static lastClosedKey: string | null = null;
  private static lastCloseAt = 0;

  /** Open (or toggle-guard) the primary popup for `key`, anchored under `anchor` (window-content DIP). */
  static open(opts: OpenPopupOptions): void {
    const { parent, key, query, anchor } = opts;
    if (PopupWindowManager.openKey === key) return; // already open
    if (
      key === PopupWindowManager.lastClosedKey &&
      nowMs() - PopupWindowManager.lastCloseAt < REOPEN_GUARD_MS
    ) {
      return; // this open is the second half of a click-to-toggle-off; swallow it
    }
    PopupWindowManager.close(); // only one primary popup at a time

    const width = opts.width ?? DEFAULT_WIDTH;
    const bounds = anchorToBounds(parent, anchor, width, opts.height);
    const win = createPopupWindow(parent, bounds);
    PopupWindowManager.win = win;
    PopupWindowManager.openKey = key;
    loadSurface(win, query, key);

    const reveal = (): void => {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    };
    win.once('ready-to-show', reveal);
    win.webContents.once('did-finish-load', reveal);

    // Click-away dismiss — but keep the menu open while focus is on its own submenu window. Debounced so
    // the newly focused window is known.
    win.on('blur', () => {
      setTimeout(() => {
        if (win.isDestroyed()) return;
        const focused = BrowserWindow.getFocusedWindow();
        if (focused === win || (PopupWindowManager.subWin !== null && focused === PopupWindowManager.subWin)) {
          return;
        }
        PopupWindowManager.close();
      }, BLUR_CLOSE_MS);
    });
    win.on('closed', () => {
      if (PopupWindowManager.win !== win) return;
      PopupWindowManager.closeSub();
      const closedKey = PopupWindowManager.openKey;
      PopupWindowManager.win = null;
      PopupWindowManager.lastClosedKey = closedKey;
      PopupWindowManager.openKey = null;
      PopupWindowManager.lastCloseAt = nowMs();
      if (!parent.isDestroyed() && closedKey !== null) {
        parent.webContents.send(IpcChannels.popupClosed, closedKey);
      }
    });
  }

  /** Open (or replace) the submenu flyout to the LEFT of the primary popup, aligned to `anchor.y`. */
  static openSubmenu(opts: OpenSubmenuOptions): void {
    const parent = PopupWindowManager.win;
    if (parent === null || parent.isDestroyed()) return; // no menu open → nothing to attach to
    PopupWindowManager.closeSub();

    const bounds = subAnchorToBounds(parent, opts.anchor, opts.height);
    const win = createPopupWindow(parent, bounds);
    PopupWindowManager.subWin = win;
    loadSurface(win, opts.query, 'menu-sub');

    // Show WITHOUT stealing focus, so the primary popup doesn't blur (and close) when the flyout opens.
    const reveal = (): void => {
      if (!win.isDestroyed() && !win.isVisible()) win.showInactive();
    };
    win.once('ready-to-show', reveal);
    win.webContents.once('did-finish-load', reveal);
    // If the sub is clicked and then focus leaves the pair entirely, tear everything down.
    win.on('blur', () => {
      setTimeout(() => {
        if (win.isDestroyed()) return;
        const focused = BrowserWindow.getFocusedWindow();
        const primary = PopupWindowManager.win;
        if (focused === win || (primary !== null && focused === primary)) return;
        PopupWindowManager.close();
      }, BLUR_CLOSE_MS);
    });
    win.on('closed', () => {
      if (PopupWindowManager.subWin === win) PopupWindowManager.subWin = null;
    });
  }

  /** Shrink/grow the primary popup to its measured content height (px), keeping the top anchor. Only the
   *  managed primary popup may self-resize; height is clamped to the work area below its current top. */
  static resize(sender: BrowserWindow, height: number): void {
    const win = PopupWindowManager.win;
    if (win === null || win.isDestroyed() || sender !== win) return;
    const b = win.getBounds();
    const area = screen.getDisplayMatching(b).workArea;
    const maxH = area.y + area.height - b.y - GAP;
    const next = Math.max(MIN_HEIGHT, Math.min(height, maxH));
    if (next === b.height) return;
    win.setBounds({ x: b.x, y: b.y, width: b.width, height: next });
  }

  static closeSub(): void {
    const win = PopupWindowManager.subWin;
    if (win !== null && !win.isDestroyed()) win.close();
  }

  static close(): void {
    PopupWindowManager.closeSub();
    const win = PopupWindowManager.win;
    if (win !== null && !win.isDestroyed()) win.close();
  }
}

function nowMs(): number {
  return Date.now();
}

/** Load the renderer bundle with the surface query (dev URL vs bundled file). */
function loadSurface(win: BrowserWindow, query: Record<string, string>, key: string): void {
  const search = new URLSearchParams(query).toString();
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  const loaded =
    devUrl !== undefined && devUrl.length > 0
      ? win.loadURL(`${devUrl}?${search}`)
      : win.loadFile(join(__dirname, '../renderer/index.html'), { query });
  void loaded.catch((err: unknown) => {
    Logger.warn('Popup failed to load', { key, err: String(err) });
  });
}

/** Place the popup under the anchor (right-aligned to it, so it opens leftward), clamped to the work area. */
function anchorToBounds(
  parent: BrowserWindow,
  anchor: Rectangle,
  width: number,
  desiredHeight?: number,
): Rectangle {
  const cb = parent.getContentBounds();
  const area = screen.getDisplayMatching(cb).workArea;
  let x = Math.round(cb.x + anchor.x + anchor.width - width);
  let y = Math.round(cb.y + anchor.y + anchor.height + GAP);
  x = Math.min(Math.max(x, area.x), area.x + area.width - width);
  const cap = desiredHeight ?? DEFAULT_MAX_HEIGHT;
  const height = Math.min(cap, area.y + area.height - y - GAP);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);
  return { x, y, width, height: Math.max(height, MIN_HEIGHT) };
}

/** Place the submenu just LEFT of the primary popup, top-aligned to the hovered row (`anchor.y`).
 *  Falls back to the right side if there's no room on the left. Clamped to the display work area. */
function subAnchorToBounds(parent: BrowserWindow, anchor: Rectangle, desiredHeight?: number): Rectangle {
  const pb = parent.getBounds();
  const area = screen.getDisplayMatching(pb).workArea;
  const width = SUBMENU_WIDTH;
  let x = pb.x - width + 1; // 1px overlap so there's no seam
  if (x < area.x) x = pb.x + pb.width - 1; // no room on the left → open to the right instead
  x = Math.min(Math.max(x, area.x), area.x + area.width - width);
  let y = Math.round(pb.y + anchor.y);
  const cap = desiredHeight ?? DEFAULT_MAX_HEIGHT;
  const height = Math.min(cap, area.y + area.height - y - GAP);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);
  return { x, y, width, height: Math.max(height, 100) };
}
