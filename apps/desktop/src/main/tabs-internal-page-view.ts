import {
  WebContentsView,
  type BrowserWindow,
  type ContextMenuParams,
  type Rectangle,
} from 'electron';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_SETTINGS_URL,
  INTERNAL_UPLOADS_URL,
} from '@tepegoz/desktop-ipc';
import { CHROME_WEB_PREFERENCES } from './window';
import { contextMenuObservers, internalBaseUrl } from './tabs-shared';

/**
 * Real `WebContentsView`s for internal (`tepegoz://…`) tabs — Faz 2 of
 * `phases/tracks/protocol-tepegoz-pages.md`.
 *
 * Deliberately kept in a SEPARATE map from `WindowTabsBase.views` (never inserted there): the whole
 * point of the "no view entry ⟺ internal" invariant (`tabs-window-closing.ts`) is that agent
 * perception/screenshot capture, DevTools gating, tab-discard, and cross-window tear-off/rehost all
 * already treat a viewless tab as "not drivable, not a browsing session" — behavior that is CORRECT for
 * a trusted first-party settings page (it should not be silently treated as agent-drivable web content).
 * Giving it a real view for display + context-menu purposes without touching any of those call sites is
 * exactly what keeping it out of `views` buys.
 *
 * Uses the SAME `CHROME_WEB_PREFERENCES` (preload + `persist:tepegoz-app` partition) as the chrome
 * window itself — this is trusted, bundled, first-party content (the same renderer bundle the chrome
 * document already loads), not browsed (untrusted) content, so it gets the same trust level it already
 * had when it rendered as a React overlay inside the chrome document. Nothing about the security
 * boundary changes; only the document boundary does.
 */

/**
 * Internal-page base URLs that get a REAL WebContentsView instead of a chrome-rendered React overlay.
 *
 * Settings was the first entry (2026-08-26), which required root-causing a real Electron bug:
 * subresource requests (the bundle's `<script src>`/`<link href>`) never reach
 * `internal-pages/protocol.ts`'s handler for this scheme, so that file now serves a single
 * self-contained document with everything inlined — see its doc comment for the full story. Every host
 * here serves the SAME inlined bundle (`internal-pages/protocol.ts`'s `REAL_PAGE_HOSTS` must list the
 * matching hostname, and `main.tsx` must dispatch it to a `*Surface` component) — Faz 3
 * (2026-08-26) added the rest of the pages that had a chrome-rendered React branch in
 * `App-content.tsx`. `tepegoz://tasks` is deliberately NOT here: no UI currently renders it (dead route,
 * left for whenever the Tasks product rework lands).
 */
const REAL_PAGE_BASE_URLS = new Set<string>([
  INTERNAL_SETTINGS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_UPLOADS_URL,
  INTERNAL_BOOKMARKS_URL,
]);

/** Whether `url` (an internal-page tab's full URL, hash included) should be backed by a real view. */
export function hasRealPage(url: string): boolean {
  return REAL_PAGE_BASE_URLS.has(internalBaseUrl(url));
}

/** The context-menu listener currently wired to a view, so tear-off/merge (`detachTab`/`adoptTab`) can
 *  drop the OLD window's handler and attach a fresh one bound to the NEW window — exactly the
 *  `unwireView`/`wireView` pattern browsed tabs use, scoped to the one event this view wires. */
const contextMenuHandlers = new WeakMap<
  WebContentsView,
  (event: Electron.Event, params: ContextMenuParams) => void
>();

function wireContextMenu(win: BrowserWindow, view: WebContentsView, getBounds: () => Rectangle): void {
  const wc = view.webContents;
  // ONLY the context-menu is wired. This is trusted, bundled content, not a browsed page — none of the
  // browsed-tab wiring in `tabs-view-wiring.ts` applies (popup blocker, history recording, favicon
  // fetch, unload prompt). In particular, page-title-updated is deliberately NOT wired: the tab's title
  // is `internalTitleFor(url)` (localized, chosen by the tab layer), and syncing the document's own
  // `<title>` would silently override it with whatever the bundle's `index.html` declares.
  const handler = (_event: Electron.Event, params: ContextMenuParams): void => {
    if (win.isDestroyed()) return;
    const nav = {
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    };
    for (const observe of contextMenuObservers) observe(win, wc, params, getBounds(), nav);
  };
  contextMenuHandlers.set(view, handler);
  wc.on('context-menu', handler);
}

/** Drop the currently-wired context-menu handler — call BEFORE handing a view to another window
 *  (`detachTab`), or its context menu would keep reporting the OLD window/bounds. */
export function unwireInternalPageView(view: WebContentsView): void {
  const handler = contextMenuHandlers.get(view);
  if (handler === undefined) return;
  view.webContents.removeListener('context-menu', handler);
  contextMenuHandlers.delete(view);
}

/** Re-wire the context-menu handler bound to a NEW window/bounds source — call from `adoptTab` after
 *  re-homing a torn-off/merged internal-page view. */
export function rewireInternalPageView(
  win: BrowserWindow,
  view: WebContentsView,
  getBounds: () => Rectangle,
): void {
  unwireInternalPageView(view);
  wireContextMenu(win, view, getBounds);
}

/**
 * Create (and start loading) the real view for an internal-page tab. Not shown/sized yet — the caller
 * (`openInternalPage`) always activates the tab immediately after, which attaches and sizes it.
 */
export function createInternalPageView(
  win: BrowserWindow,
  url: string,
  getBounds: () => Rectangle,
): WebContentsView {
  const view = new WebContentsView({ webPreferences: { ...CHROME_WEB_PREFERENCES } });
  wireContextMenu(win, view, getBounds);
  void view.webContents.loadURL(url);
  return view;
}

/** Navigate an existing internal-page view to a new URL (e.g. the same settings tab re-opened on a
 *  different section hash) — a no-op if it is already there. */
export function navigateInternalPageView(view: WebContentsView, url: string): void {
  if (view.webContents.getURL() === url) return;
  void view.webContents.loadURL(url).catch(() => undefined);
}

/** Attach (if detached) and size the view to the current content bounds. */
export function showInternalPageView(win: BrowserWindow, view: WebContentsView, bounds: Rectangle): void {
  if (!win.contentView.children.includes(view)) win.contentView.addChildView(view);
  view.setBounds(bounds);
}

/** Detach the view from the window's content tree without destroying it (kept alive for next show). */
export function hideInternalPageView(win: BrowserWindow, view: WebContentsView): void {
  if (win.contentView.children.includes(view)) win.contentView.removeChildView(view);
}

/** Tear down an internal-page view (tab closed / window disposed). Best-effort, mirroring
 *  `WindowTabsBase.dispose()`'s per-view try/catch — this runs inside teardown paths where a throw
 *  would become an uncaught main-process exception rather than a handled error. */
export function destroyInternalPageView(win: BrowserWindow, view: WebContentsView): void {
  try {
    if (!win.isDestroyed()) win.contentView.removeChildView(view);
    unwireInternalPageView(view);
    const contents = view.webContents;
    if (contents !== undefined && !contents.isDestroyed()) contents.close();
  } catch {
    // best-effort teardown — the tab is going away regardless
  }
}
