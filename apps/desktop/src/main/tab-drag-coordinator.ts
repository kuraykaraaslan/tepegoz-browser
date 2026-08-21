import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { Logger } from '@tepegoz/libs';
import {
  IpcChannels,
  type TabDragBegin,
  type TabDragItem,
  type TabDragPoint,
  type TabStripGeometry,
} from '@tepegoz/desktop-ipc';
import {
  TabDragBeginSchema,
  TabDragPointSchema,
  TabStripGeometrySchema,
} from '@tepegoz/desktop-ipc/schemas';
import TabManager from './tabs';
import { openWindow } from './browser-windows';
import { createDragPreviewWindow } from './window';
import { resolveSurfaceTheme } from './lib/surface-theme';
import { onWindowAction, onWindowSignal } from './ipc/ipc-helpers';

/**
 * Chrome-like tab tear-off coordinator (main process). The source window's renderer keeps DOM pointer
 * capture for the whole drag, so it streams the pointer (desktop-global screen coords) once the tab has
 * been torn out of the strip. This module drives the floating preview window that follows the cursor and,
 * on release, hit-tests every window's reported strip geometry: a hit merges the tab into that window at
 * the drop index; a miss tears it off into a brand-new window at the cursor. The live `WebContentsView`
 * is re-homed (never reloaded) via `WindowTabs.detachTab`/`adoptTab`.
 */

/** Default size of a torn-off window (matches `createWindow`'s default). */
const NEW_WINDOW_WIDTH = 1000;
const NEW_WINDOW_HEIGHT = 720;
/** Where the new window's top edge sits relative to the drop point, so the strip lands under the cursor. */
const NEW_WINDOW_STRIP_OFFSET = 24;
/** Cap the favicon carried in the preview URL (a huge data: URL would blow the query string). */
const MAX_PREVIEW_FAVICON = 4096;

interface DragSession {
  sourceWin: BrowserWindow;
  item: TabDragItem;
  preview: BrowserWindow | null;
  /** Where within the tab the pointer grabbed, so the chip stays held under the cursor at that point. */
  grabOffset: { x: number; y: number };
  /** The preview chip size (= the real tab's measured size) — bounds the grab-offset clamp. */
  width: number;
  height: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(n, hi));

let session: DragSession | null = null;
/** Latest reported strip geometry per chrome window (keyed by BrowserWindow.id), for drop hit-testing. */
const stripGeometry = new Map<number, TabStripGeometry>();

/** Load the drag-preview renderer surface (dev URL vs bundled file), carrying everything needed to
 *  render the chip identical to the real tab (title/favicon/active/pinned/group color) + the theme so
 *  its surface colors match before first paint. */
function loadPreviewSurface(win: BrowserWindow, payload: TabDragBegin): void {
  const favicon =
    payload.faviconUrl !== null && payload.faviconUrl.length <= MAX_PREVIEW_FAVICON
      ? payload.faviconUrl
      : '';
  const surfaceTheme = resolveSurfaceTheme();
  const query: Record<string, string> = {
    surface: 'drag-preview',
    title: payload.title,
    kind: payload.item.kind,
    active: payload.active ? '1' : '0',
    pinned: payload.pinned ? '1' : '0',
    theme: surfaceTheme.theme,
    ...(surfaceTheme.themeColor.length > 0 ? { themeColor: surfaceTheme.themeColor } : {}),
    ...(favicon.length > 0 ? { favicon } : {}),
    ...(payload.groupColor !== null ? { groupColor: payload.groupColor } : {}),
  };
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  const loaded =
    devUrl !== undefined && devUrl.length > 0
      ? win.loadURL(`${devUrl}?${new URLSearchParams(query).toString()}`)
      : win.loadFile(join(__dirname, '../renderer/index.html'), { query });
  void loaded.catch((err: unknown) => {
    Logger.warn('Drag preview failed to load', { err: String(err) });
  });
}

function destroyPreview(win: BrowserWindow | null): void {
  if (win !== null && !win.isDestroyed()) win.close();
}

/** Reposition the floating preview so the point where the tab was grabbed stays under the cursor
 *  (Chrome parity), revealing it on the first move. */
function positionPreview(point: TabDragPoint): void {
  if (session === null) return;
  const preview = session.preview;
  if (preview === null || preview.isDestroyed()) return;
  // Clamp the grab offset to the chip so the cursor always lands on the chip, never off its edge.
  const gx = clamp(session.grabOffset.x, 0, session.width);
  const gy = clamp(session.grabOffset.y, 0, session.height);
  preview.setPosition(Math.round(point.screenX - gx), Math.round(point.screenY - gy));
  if (!preview.isVisible()) preview.showInactive();
}

/** Which window's strip (if any) the drop point lands in, and the insertion index within it. All in the
 *  reporting renderer's client coords (getBoundingClientRect), offset by the window's screen origin. */
function hitTestStrip(point: TabDragPoint): { win: BrowserWindow; index: number } | null {
  for (const wt of TabManager.all()) {
    const win = wt.window;
    if (win.isDestroyed()) continue;
    const geo = stripGeometry.get(win.id);
    if (geo === undefined) continue;
    const cb = win.getContentBounds();
    const pageX = point.screenX - cb.x;
    const pageY = point.screenY - cb.y;
    const { strip } = geo;
    if (
      pageX >= strip.x &&
      pageX <= strip.x + strip.width &&
      pageY >= strip.y &&
      pageY <= strip.y + strip.height
    ) {
      let index = 0;
      for (const slot of geo.slots) {
        if (pageX > slot.left + slot.width / 2) index += 1;
      }
      return { win, index };
    }
  }
  return null;
}

/** Move a tab (or every member of a group, in order) out of `sourceWin` into `destWin` at `index`. */
function moveItemToWindow(
  sourceWin: BrowserWindow,
  item: TabDragItem,
  destWin: BrowserWindow,
  index: number,
): void {
  const src = TabManager.forWindow(sourceWin);
  const dst = TabManager.forWindow(destWin);
  if (src === undefined || dst === undefined) return;
  const ids = item.kind === 'group' ? src.groupMemberIds(item.id) : [item.id];
  let at = index;
  for (const id of ids) {
    const detached = src.detachTab(id);
    if (detached !== null) {
      dst.adoptTab(detached, at);
      at += 1;
    }
  }
  if (!destWin.isDestroyed()) destWin.focus();
}

/** Tear a tab/group out of `sourceWin` into a brand-new window at the drop point. */
function tearOffToNewWindow(
  sourceWin: BrowserWindow,
  item: TabDragItem,
  point: TabDragPoint,
): void {
  const src = TabManager.forWindow(sourceWin);
  if (src === undefined) return;
  const ids = item.kind === 'group' ? src.groupMemberIds(item.id) : [item.id];
  if (ids.length === 0) return;
  const position = {
    x: Math.round(point.screenX - NEW_WINDOW_WIDTH / 2),
    y: Math.round(point.screenY - NEW_WINDOW_STRIP_OFFSET),
  };
  const newWin = openWindow({
    tabs: 'none',
    position,
    size: { width: NEW_WINDOW_WIDTH, height: NEW_WINDOW_HEIGHT },
  });
  const dst = TabManager.forWindow(newWin);
  if (dst === undefined) return;
  for (const id of ids) {
    const detached = src.detachTab(id);
    if (detached !== null) dst.adoptTab(detached);
  }
}

/** Resolve a torn drop: merge into a hovered window's strip, or tear off into a new window. */
function performDrop(s: DragSession, point: TabDragPoint): void {
  const target = hitTestStrip(point);
  if (target !== null) {
    // Dropped back onto the SOURCE window's own strip → leave the tab where it is (no move).
    if (target.win !== s.sourceWin) {
      moveItemToWindow(s.sourceWin, s.item, target.win, target.index);
    }
    return;
  }
  tearOffToNewWindow(s.sourceWin, s.item, point);
}

// ── IPC wiring ─────────────────────────────────────────────────────────────────────────────────────

/** Register the tab tear-off drag IPC (renderer → main). Wired from `registerIpc`. */
export function registerTabDragIpc(): void {
  onWindowAction(IpcChannels.tabsDragBegin, TabDragBeginSchema, (win, payload) => {
    // A prior session should already be gone; clear defensively so a preview can't leak.
    cancelDrag();
    const preview = createDragPreviewWindow();
    // Size the preview window to the real tab's measured size so it looks 1:1 with the tab it left.
    const width = Math.max(48, Math.round(payload.width));
    const height = Math.max(24, Math.round(payload.height));
    preview.setSize(width, height);
    loadPreviewSurface(preview, payload);
    session = {
      sourceWin: win,
      item: payload.item,
      preview,
      grabOffset: payload.grabOffset,
      width,
      height,
    };
  });
  onWindowAction(IpcChannels.tabsDragMove, TabDragPointSchema, (_win, point) => {
    if (session === null) return;
    positionPreview(point);
  });
  onWindowAction(IpcChannels.tabsDragEnd, TabDragPointSchema, (_win, point) => {
    const s = session;
    session = null;
    if (s === null) return;
    destroyPreview(s.preview);
    performDrop(s, point);
  });
  onWindowSignal(IpcChannels.tabsDragCancel, () => {
    cancelDrag();
  });
  onWindowAction(IpcChannels.tabsReportStrip, TabStripGeometrySchema, (win, geometry) => {
    // Register the cleanup only on the FIRST report for this window — geometry is reported often, so
    // adding a `closed` listener each time would leak listeners.
    const isFirst = !stripGeometry.has(win.id);
    stripGeometry.set(win.id, geometry);
    if (isFirst) win.once('closed', () => stripGeometry.delete(win.id));
  });
  onWindowSignal(IpcChannels.windowNew, () => {
    openWindow({ tabs: 'default' }); // a fresh blank new-tab, not a session re-restore
  });
}

/** Tear down any in-flight drag preview without performing a move (Esc / invalid drop / new begin). */
function cancelDrag(): void {
  if (session === null) return;
  destroyPreview(session.preview);
  session = null;
}
