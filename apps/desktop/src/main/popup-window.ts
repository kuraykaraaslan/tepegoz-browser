import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import { Logger } from '@tepegoz/libs';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { createPopupWindow } from './window';

/**
 * Owns THE single popup window — a native, frameless child window that floats above the browsed page
 * (which stays live behind it), anchored under a toolbar control. It reuses the main renderer bundle
 * via a `?surface=<kind>` marker (see the renderer entry) so the popup renders only that surface, with
 * the same trusted `window.tepegoz` bridge. Dismissed by losing focus (click-away), Escape, its own
 * Close control, or re-triggering.
 *
 * Generic + reusable: it hosts extension popups, the main (hamburger) menu, and any future popup
 * surface, keyed by a caller-supplied `key` (used for the single-instance + toggle guard). This was
 * generalized from the extension-only popup manager so other surfaces can reuse the same primitive.
 */
const DEFAULT_WIDTH = 360;
const DEFAULT_MAX_HEIGHT = 520;
const MIN_HEIGHT = 160;
const GAP = 6;
/** Ignore an open that lands right after a blur-close of the SAME key (re-trigger = toggle-off). */
const REOPEN_GUARD_MS = 250;

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

export default class PopupWindowManager {
  private static win: BrowserWindow | null = null;
  private static openKey: string | null = null;
  private static lastClosedKey: string | null = null;
  private static lastCloseAt = 0;

  /** Open (or toggle-guard) the popup for `key`, anchored under `anchor` (window-content DIP rect). */
  static open(opts: OpenPopupOptions): void {
    const { parent, key, query, anchor } = opts;
    if (PopupWindowManager.openKey === key) return; // already open
    if (
      key === PopupWindowManager.lastClosedKey &&
      nowMs() - PopupWindowManager.lastCloseAt < REOPEN_GUARD_MS
    ) {
      return; // this open is the second half of a click-to-toggle-off; swallow it
    }
    PopupWindowManager.close(); // only one popup at a time

    const width = opts.width ?? DEFAULT_WIDTH;
    const bounds = anchorToBounds(parent, anchor, width, opts.height);
    const win = createPopupWindow(parent, bounds);
    PopupWindowManager.win = win;
    PopupWindowManager.openKey = key;

    const search = new URLSearchParams(query).toString();
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    const loaded =
      devUrl !== undefined && devUrl.length > 0
        ? win.loadURL(`${devUrl}?${search}`)
        : win.loadFile(join(__dirname, '../renderer/index.html'), { query });
    void loaded.catch((err: unknown) => {
      Logger.warn('Popup failed to load', { key, err: String(err) });
    });

    // Reveal robustly (never leave it stuck hidden if 'ready-to-show' is delayed). show() is idempotent.
    const reveal = (): void => {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    };
    win.once('ready-to-show', reveal);
    win.webContents.once('did-finish-load', reveal);
    // Click-away dismiss: losing focus closes the popup (Chrome-style).
    win.on('blur', () => {
      PopupWindowManager.close();
    });
    win.on('closed', () => {
      if (PopupWindowManager.win !== win) return;
      const closedKey = PopupWindowManager.openKey;
      PopupWindowManager.win = null;
      PopupWindowManager.lastClosedKey = closedKey;
      PopupWindowManager.openKey = null;
      PopupWindowManager.lastCloseAt = nowMs();
      // Notify the parent renderer which surface closed (drives pressed-state / aria-expanded).
      if (!parent.isDestroyed() && closedKey !== null) {
        parent.webContents.send(IpcChannels.popupClosed, closedKey);
      }
    });
  }

  static close(): void {
    const win = PopupWindowManager.win;
    if (win !== null && !win.isDestroyed()) win.close();
  }
}

function nowMs(): number {
  return Date.now();
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
