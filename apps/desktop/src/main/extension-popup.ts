import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import { Logger } from '@tepegoz/libs';
import { IpcChannels } from '../shared/ipc-contract';
import { manifestById } from '../shared/extensions';
import { createPopupWindow } from './window';

/**
 * Owns the single extension popup window — a native, frameless child window that floats above the
 * browsed page (which stays live behind it), anchored under the toolbar icon. It reuses the main
 * renderer bundle via a `?popup=<id>` marker (see the renderer entry) so the popup renders only that
 * extension's `popup` surface, with the same trusted `window.tepegoz` bridge. Dismissed by losing
 * focus (click-away), its own Close button, Escape, or re-clicking the icon.
 */
const POPUP_WIDTH = 360;
const POPUP_MAX_HEIGHT = 520;
const GAP = 6;
/** Ignore an open that lands right after a blur-close of the SAME popup (icon re-click = toggle-off). */
const REOPEN_GUARD_MS = 250;

export default class ExtensionPopupManager {
  private static win: BrowserWindow | null = null;
  private static openId: string | null = null;
  private static lastClosedId: string | null = null;
  private static lastCloseAt = 0;

  /** Open (or toggle-guard) the popup for `id`, anchored under `anchor` (window-content DIP rect). */
  static open(parent: BrowserWindow, id: string, anchor: Rectangle): void {
    const manifest = manifestById(id);
    if (manifest === undefined || !manifest.surfaces.includes('popup')) {
      Logger.warn('Ignored popup open for a non-popup extension', { id });
      return;
    }
    if (ExtensionPopupManager.openId === id) return; // already open
    if (
      id === ExtensionPopupManager.lastClosedId &&
      nowMs() - ExtensionPopupManager.lastCloseAt < REOPEN_GUARD_MS
    ) {
      return; // this open is the second half of a click-to-toggle-off; swallow it
    }
    ExtensionPopupManager.close(); // only one popup at a time

    const bounds = anchorToBounds(parent, anchor);
    const win = createPopupWindow(parent, bounds);
    ExtensionPopupManager.win = win;
    ExtensionPopupManager.openId = id;

    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    const loaded =
      devUrl !== undefined && devUrl.length > 0
        ? win.loadURL(`${devUrl}?popup=${encodeURIComponent(id)}`)
        : win.loadFile(join(__dirname, '../renderer/index.html'), { query: { popup: id } });
    void loaded.catch((err: unknown) => {
      Logger.warn('Popup failed to load', { id, err: String(err) });
    });

    // Reveal robustly (never leave it stuck hidden if 'ready-to-show' is delayed). show() is idempotent.
    const reveal = (): void => {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    };
    win.once('ready-to-show', reveal);
    win.webContents.once('did-finish-load', reveal);
    // Click-away dismiss: losing focus closes the popup (Chrome-style).
    win.on('blur', () => {
      ExtensionPopupManager.close();
    });
    win.on('closed', () => {
      if (ExtensionPopupManager.win !== win) return;
      ExtensionPopupManager.win = null;
      ExtensionPopupManager.lastClosedId = ExtensionPopupManager.openId;
      ExtensionPopupManager.openId = null;
      ExtensionPopupManager.lastCloseAt = nowMs();
      if (!parent.isDestroyed()) parent.webContents.send(IpcChannels.extensionPopupClosed);
    });
  }

  static close(): void {
    const win = ExtensionPopupManager.win;
    if (win !== null && !win.isDestroyed()) win.close();
  }
}

function nowMs(): number {
  return Date.now();
}

/** Place the popup under the icon (right-aligned to it), clamped to the display's work area. */
function anchorToBounds(parent: BrowserWindow, anchor: Rectangle): Rectangle {
  const cb = parent.getContentBounds();
  const area = screen.getDisplayMatching(cb).workArea;
  let x = Math.round(cb.x + anchor.x + anchor.width - POPUP_WIDTH);
  let y = Math.round(cb.y + anchor.y + anchor.height + GAP);
  x = Math.min(Math.max(x, area.x), area.x + area.width - POPUP_WIDTH);
  const height = Math.min(POPUP_MAX_HEIGHT, area.y + area.height - y - GAP);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);
  return { x, y, width: POPUP_WIDTH, height: Math.max(height, 160) };
}
