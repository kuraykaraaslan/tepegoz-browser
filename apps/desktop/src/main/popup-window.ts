import { BrowserWindow, screen, type Rectangle } from 'electron';
import { chromeFilePath } from './chrome-url';
import { Logger } from '@tepegoz/libs';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { createPopupWindow } from './window';
import { resolveSurfaceTheme } from './lib/surface-theme';

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
/** Submenu flyouts can be much shorter than the primary popup (a 1–2 row list), so they floor lower. */
const SUBMENU_MIN_HEIGHT = 44;
const GAP = 6;
const SUBMENU_WIDTH = 260;
/** Ignore an open that lands right after a blur-close of the SAME key (re-trigger = toggle-off). */
const REOPEN_GUARD_MS = 250;
/** Debounce a blur before acting, so focus can settle on the sub window (or elsewhere) first. */
const BLUR_CLOSE_MS = 90;
/** Reveal-on-measure: after the renderer reports a content height, wait this long for further measures
 *  to settle (empty→data re-measure, locale swap) before showing — so the window appears ONCE at its
 *  final size instead of flashing an oversized empty box that then shrinks. */
const SETTLE_MS = 80;
/** Hard fallback so surfaces that never report a height (notifications, extension popups) still reveal.
 *  Timed from `did-finish-load`, NOT from open(): before the document has loaded there is nothing in the
 *  window to show, and revealing then is exactly the "empty box, then the menu" flash — 250ms is a
 *  plausible budget for a renderer that is already up, and nowhere near enough for a cold bundle (a dev
 *  Vite load is seconds). Tight, because a toolbar menu must feel instant. */
const FALLBACK_MS = 250;
/** Absolute last resort, timed from open(): a load that never finishes (dead dev server, a hung fetch)
 *  must not leave the menu permanently invisible with no way to tell the user why. Long enough that a
 *  normal cold load reaches `did-finish-load` first and this timer is discarded unused. */
const LOAD_CEILING_MS = 4000;
/** Fade-in ramp at reveal: opacity 0→1 over ~FADE_STEPS frames. Killing the residual white-flash that
 *  Electron can paint on show() even with a backgroundColor set — we fade from transparent (the live
 *  page shows through) so no white frame is ever visible, synchronized with the reveal. */
const FADE_STEPS = 6;
const FADE_STEP_MS = 10;

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
  /** Horizontal placement relative to `anchor`. `'end'` (default) right-aligns the popup to the
   *  anchor's right edge (toolbar controls open leftward); `'start'` left-aligns it to the anchor's
   *  left edge (a context menu opens rightward from the cursor). */
  align?: 'start' | 'end';
}

export interface OpenSubmenuOptions {
  /** Query params for the sub surface (e.g. `{ surface: 'menu-sub', kind: 'history' }`). */
  query: Record<string, string>;
  /** The flyout parent row's rect, in the PRIMARY popup's content viewport (for vertical alignment). */
  anchor: Rectangle;
  /** Desired content height (px). */
  height?: number | undefined;
}

/** Per-window reveal bookkeeping for the reveal-on-measure gate (see armReveal). */
interface RevealState {
  /** `'active'` → show() (primary popup takes focus); `'inactive'` → showInactive() (submenu must not
   *  steal focus, else the primary blurs and closes). */
  mode: 'active' | 'inactive';
  /** Settle debounce: rescheduled on each measure; fires the reveal once measures quiet down. */
  settle: ReturnType<typeof setTimeout> | null;
  /** Hard cap so a never-measuring surface still reveals. Starts as the LOAD_CEILING_MS timer from
   *  open() and is replaced by the tighter FALLBACK_MS one once the document has actually loaded. */
  fallback: ReturnType<typeof setTimeout> | null;
  /** Opacity ramp interval running while the window fades in (0→1) at reveal. */
  fade: ReturnType<typeof setInterval> | null;
  /** Latched once shown, so neither timer nor a later measure re-triggers show(). */
  done: boolean;
}

export default class PopupWindowManager {
  private static win: BrowserWindow | null = null;
  private static subWin: BrowserWindow | null = null;
  private static openKey: string | null = null;
  private static lastClosedKey: string | null = null;
  private static lastCloseAt = 0;
  /** Reveal state keyed by window — WeakMap so `resize()` looks it up without a primary/sub branch, and
   *  entries drop when a window is GC'd (timers are also cleared explicitly on close). */
  private static readonly reveals = new WeakMap<BrowserWindow, RevealState>();

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
    const bounds = anchorToBounds(parent, anchor, width, opts.height, opts.align ?? 'end');
    // Resolve the active theme up front so the window's first paint AND the pre-mount renderer use the
    // right surface color — otherwise a light/custom theme flashes navy before applyTheme runs.
    const surface = resolveSurfaceTheme();
    const win = createPopupWindow(parent, bounds, surface.color);
    PopupWindowManager.win = win;
    PopupWindowManager.openKey = key;
    loadSurface(win, { ...query, theme: surface.theme, themeColor: surface.themeColor }, key);

    // Reveal only once the renderer has measured its content (or the fallback fires) — showing on
    // ready-to-show would flash the oversized open-time estimate before it shrinks to fit.
    PopupWindowManager.armReveal(win, 'active');

    // Click-away dismiss — but keep the menu open while focus is on its own submenu window. Debounced so
    // the newly focused window is known.
    win.on('blur', () => {
      setTimeout(() => {
        if (win.isDestroyed()) return;
        const focused = BrowserWindow.getFocusedWindow();
        if (
          focused === win ||
          (PopupWindowManager.subWin !== null && focused === PopupWindowManager.subWin)
        ) {
          return;
        }
        PopupWindowManager.close();
      }, BLUR_CLOSE_MS);
    });
    win.on('closed', () => {
      PopupWindowManager.disarmReveal(win);
      if (PopupWindowManager.win !== win) return;
      PopupWindowManager.closeSub();
      const closedKey = PopupWindowManager.openKey;
      PopupWindowManager.win = null;
      PopupWindowManager.lastClosedKey = closedKey;
      PopupWindowManager.openKey = null;
      PopupWindowManager.lastCloseAt = nowMs();
      if (!parent.isDestroyed()) {
        // On Windows, closing a frameless child window can cause the parent to minimize due to how
        // the OS handles focus handoff. Re-focus the parent explicitly to prevent this.
        if (!parent.isMinimized()) parent.focus();
        if (closedKey !== null) parent.webContents.send(IpcChannels.popupClosed, closedKey);
      }
    });
  }

  /** Open (or replace) the submenu flyout to the LEFT of the primary popup, aligned to `anchor.y`. */
  static openSubmenu(opts: OpenSubmenuOptions): void {
    const parent = PopupWindowManager.win;
    if (parent === null || parent.isDestroyed()) return; // no menu open → nothing to attach to
    PopupWindowManager.closeSub();

    const bounds = subAnchorToBounds(parent, opts.anchor, opts.height);
    const surface = resolveSurfaceTheme();
    const win = createPopupWindow(parent, bounds, surface.color);
    PopupWindowManager.subWin = win;
    loadSurface(
      win,
      { ...opts.query, theme: surface.theme, themeColor: surface.themeColor },
      'menu-sub',
    );

    // Reveal on measure (like the primary), but WITHOUT stealing focus — else the primary popup blurs
    // and closes when the flyout opens.
    PopupWindowManager.armReveal(win, 'inactive');
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
      PopupWindowManager.disarmReveal(win);
      if (PopupWindowManager.subWin === win) PopupWindowManager.subWin = null;
    });
  }

  /** Shrink/grow a managed popup to its measured content height (px), keeping the top anchor. Both the
   *  primary popup AND the submenu flyout may self-resize (each observes its own content); height is
   *  clamped to the work area below the window's current top. Submenu flyouts and the bookmark
   *  folder-dropdown / dialog popups use a smaller floor so a short one (e.g. a 1-item folder) doesn't
   *  leave dead rows — the big menus keep the taller MIN_HEIGHT. */
  static resize(sender: BrowserWindow, height: number): void {
    const isPrimary = sender === PopupWindowManager.win;
    const isSub = sender === PopupWindowManager.subWin;
    if ((!isPrimary && !isSub) || sender.isDestroyed()) return;
    const b = sender.getBounds();
    const area = screen.getDisplayMatching(b).workArea;
    const maxH = area.y + area.height - b.y - GAP;
    const smallFloor =
      isSub || (isPrimary && (PopupWindowManager.openKey?.startsWith('bookmark-') ?? false));
    const floor = smallFloor ? SUBMENU_MIN_HEIGHT : MIN_HEIGHT;
    const next = Math.max(floor, Math.min(height, maxH));
    // Arm/reschedule the reveal on EVERY measure — even a no-op one below, whose bounds don't change,
    // still means the content settled and the window should be shown.
    PopupWindowManager.bumpReveal(sender);
    if (next === b.height) return;
    sender.setBounds({ x: b.x, y: b.y, width: b.width, height: next });
  }

  /** Arm the reveal-on-measure gate for `win`. Two timers, because they answer different questions:
   *  the ceiling (from now) is "this load is broken, show something anyway"; the fallback (from
   *  `did-finish-load`) is "this surface never reports a height, so measures will never come".
   *
   *  Arming the tight fallback at open() instead — which is what this did — is what made a menu appear
   *  as an empty themed rectangle that filled in a beat later: on any load slower than 250ms (every dev
   *  launch, and a cold first open in production) the timer won the race against the renderer, so the
   *  window was shown before it had content. The first measure still debounces to the settled size. */
  private static armReveal(win: BrowserWindow, mode: 'active' | 'inactive'): void {
    const state: RevealState = {
      mode,
      settle: null,
      fallback: setTimeout(() => PopupWindowManager.doReveal(win), LOAD_CEILING_MS),
      fade: null,
      done: false,
    };
    PopupWindowManager.reveals.set(win, state);
    win.webContents.once('did-finish-load', () => {
      const current = PopupWindowManager.reveals.get(win);
      if (current === undefined || current.done) return;
      if (current.fallback !== null) clearTimeout(current.fallback);
      current.fallback = setTimeout(() => PopupWindowManager.doReveal(win), FALLBACK_MS);
    });
  }

  /** A measure arrived for `win` — (re)start the settle debounce so consecutive measures (empty→data,
   *  locale swap) coalesce into a single reveal at the final size. No-op once revealed. */
  private static bumpReveal(win: BrowserWindow): void {
    const state = PopupWindowManager.reveals.get(win);
    if (state === undefined || state.done) return;
    if (state.settle !== null) clearTimeout(state.settle);
    state.settle = setTimeout(() => PopupWindowManager.doReveal(win), SETTLE_MS);
  }

  /** Show `win` once (latched), clearing its timers, then fade it in. `active` → show() (primary takes
   *  focus); `inactive` → showInactive() (submenu must not steal focus, or the primary blurs and closes).
   *  Shown at opacity 0 so the fade hides any white frame Electron may paint on show(). */
  private static doReveal(win: BrowserWindow): void {
    const state = PopupWindowManager.reveals.get(win);
    if (state === undefined || state.done) return;
    state.done = true;
    if (state.settle !== null) clearTimeout(state.settle);
    if (state.fallback !== null) clearTimeout(state.fallback);
    state.settle = null;
    state.fallback = null;
    if (win.isDestroyed() || win.isVisible()) return;
    win.setOpacity(0);
    if (state.mode === 'active') win.show();
    else win.showInactive();
    let step = 0;
    state.fade = setInterval(() => {
      if (win.isDestroyed()) {
        if (state.fade !== null) clearInterval(state.fade);
        state.fade = null;
        return;
      }
      step += 1;
      win.setOpacity(Math.min(1, step / FADE_STEPS));
      if (step >= FADE_STEPS) {
        if (state.fade !== null) clearInterval(state.fade);
        state.fade = null;
      }
    }, FADE_STEP_MS);
  }

  /** Cancel any pending reveal/fade for `win` and drop its state — so a queued timer can't show a closed
   *  window. Called from each window's `closed` handler. */
  private static disarmReveal(win: BrowserWindow): void {
    const state = PopupWindowManager.reveals.get(win);
    if (state === undefined) return;
    if (state.settle !== null) clearTimeout(state.settle);
    if (state.fallback !== null) clearTimeout(state.fallback);
    if (state.fade !== null) clearInterval(state.fade);
    PopupWindowManager.reveals.delete(win);
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
      : win.loadFile(chromeFilePath(), { query });
  void loaded.catch((err: unknown) => {
    Logger.warn('Popup failed to load', { key, err: String(err) });
  });
}

/** Place the popup under the anchor, clamped to the work area. `align` picks the horizontal edge:
 *  `'end'` right-aligns to the anchor (toolbar controls open leftward); `'start'` left-aligns to it
 *  (a context menu opens rightward from the cursor). Exported for the geometry unit test. */
export function anchorToBounds(
  parent: BrowserWindow,
  anchor: Rectangle,
  width: number,
  desiredHeight?: number,
  align: 'start' | 'end' = 'end',
): Rectangle {
  const cb = parent.getContentBounds();
  const area = screen.getDisplayMatching(cb).workArea;
  let x = Math.round(align === 'start' ? cb.x + anchor.x : cb.x + anchor.x + anchor.width - width);
  let y = Math.round(cb.y + anchor.y + anchor.height + GAP);
  x = Math.min(Math.max(x, area.x), area.x + area.width - width);
  const cap = desiredHeight ?? DEFAULT_MAX_HEIGHT;
  const height = Math.min(cap, area.y + area.height - y - GAP);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);
  return { x, y, width, height: Math.max(height, MIN_HEIGHT) };
}

/** Place the submenu just LEFT of the primary popup, top-aligned to the hovered row (`anchor.y`).
 *  Falls back to the right side if there's no room on the left. Clamped to the display work area.
 *  Exported for the geometry unit test. */
export function subAnchorToBounds(
  parent: BrowserWindow,
  anchor: Rectangle,
  desiredHeight?: number,
): Rectangle {
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
