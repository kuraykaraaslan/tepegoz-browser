import { BrowserWindow, WebContentsView, type Rectangle, type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  IpcChannels,
  type TabsState,
} from '@tepegoz/desktop-ipc';
import { HistoryStore } from '@tepegoz/persistence';
import { TabStore } from '@tepegoz/tab-engine';
import { internalPageUrl, isWebUrl, toNavigationUrl } from './lib/navigation-url';
import { mainLocale, mainStrings } from './lib/i18n-main';
import { extensionIdFromPageUrl, extensionLabel, manifestById } from '../shared/extensions';
import { getDb } from './db/database.electron';

/**
 * L0 tab model. Each tab is an isolated `WebContentsView` in a SEPARATE browsing partition
 * (`persist:tepegoz-web`) from the app chrome (`persist:tepegoz-app`) — browsed pages are untrusted
 * and never share the chrome's session or get the contextBridge. The chrome (tab strip + omnibox)
 * lives in the window's own webContents; the active tab's view is laid into the content area below
 * the chrome using bounds reported by the renderer.
 *
 * The pure record state (which tabs exist, which is active, ordering, TabsState projection) lives in
 * `@tepegoz/tab-engine`'s `TabStore` (unit-tested); this class owns the WebContentsViews + all Electron
 * I/O and delegates every record mutation to the store.
 *
 * Per-site partition isolation, profiles, and checkpoint/resume are later phases; this is the minimal
 * real browser core for Phase 1a.
 */
const NEW_TAB_URL = 'https://duckduckgo.com/';
/** The isolated session partition every browsed page lives in (shared with the User-Agent switcher). */
export const BROWSING_PARTITION = 'persist:tepegoz-web';

export default class TabManager {
  private static win: BrowserWindow | null = null;
  private static readonly store = new TabStore();
  /** WebContentsViews for `web` tabs (internal tabs have none), keyed by tab id. */
  private static readonly views = new Map<string, WebContentsView>();
  private static bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  private static contentVisible = true;

  static attach(win: BrowserWindow): void {
    TabManager.win = win;
  }

  /** Tear down all tabs + state when the window closes (prevents stale tabs leaking into a
   *  re-created window, e.g. macOS app 'activate'). */
  static reset(): void {
    for (const view of TabManager.views.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    TabManager.views.clear();
    TabManager.store.clear();
    TabManager.win = null;
    TabManager.contentVisible = true;
    TabManager.bounds = { x: 0, y: 0, width: 0, height: 0 };
  }

  static createTab(rawUrl?: string, opts?: { background?: boolean }): string {
    TabManager.requireWin(); // fail fast if not attached to a window
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        partition: BROWSING_PARTITION,
      },
    });
    const id = TabManager.store.add({
      kind: 'web',
      title: '',
      url: '',
      isLoading: true,
      faviconUrl: null,
    });
    TabManager.views.set(id, view);
    TabManager.wireView(id, view);

    const target = rawUrl !== undefined ? toNavigationUrl(rawUrl, NEW_TAB_URL) : NEW_TAB_URL;
    void view.webContents.loadURL(target).catch((err: unknown) => {
      Logger.warn('Tab failed to load', { url: target, err: String(err) });
    });

    // Background tabs (e.g. a non-foreground page's window.open) must NOT steal the foreground.
    if (opts?.background === true && TabManager.store.activeId !== null) {
      TabManager.emitState();
    } else {
      TabManager.activate(id);
    }
    return id;
  }

  static activate(id: string): void {
    const win = TabManager.requireWin();
    if (!TabManager.store.has(id)) return;

    // Detach the previously-active view (kept alive in the background), attach the new one. Internal
    // tabs have no view — the chrome renders their page over the (empty) content area.
    const prevId = TabManager.store.activeId;
    if (prevId !== null && prevId !== id) {
      const prevView = TabManager.views.get(prevId);
      if (prevView != null) win.contentView.removeChildView(prevView);
    }
    TabManager.store.setActive(id);
    const view = TabManager.views.get(id);
    if (TabManager.contentVisible && view !== undefined) {
      win.contentView.addChildView(view);
      view.setBounds(TabManager.bounds);
    }
    TabManager.emitState();
  }

  static closeTab(id: string): void {
    const win = TabManager.requireWin();
    if (!TabManager.store.has(id)) return;
    const view = TabManager.views.get(id);
    if (view !== undefined) {
      win.contentView.removeChildView(view);
      view.webContents.close();
      TabManager.views.delete(id);
    }
    const wasActive = TabManager.store.activeId === id;
    TabManager.store.delete(id);

    if (wasActive) {
      TabManager.store.setActive(null);
      const next = TabManager.store.ids().at(-1);
      if (next !== undefined) {
        TabManager.activate(next);
      } else {
        TabManager.emitState();
      }
    } else {
      TabManager.emitState();
    }
  }

  /** Reload a specific tab (context menu) — distinct from reloadActive (omnibox/shortcut). */
  static reloadTab(id: string): void {
    TabManager.views.get(id)?.webContents.reload();
  }

  /** Open (or focus) an internal page tab (tepegoz://settings, tepegoz://extensions) — rendered by
   *  the chrome, no web view. A new-tab experience for internal pages, mirroring Chrome's chrome://. */
  static openInternalPage(url: string): void {
    TabManager.requireWin();
    const existing = TabManager.store.findInternal(url);
    if (existing !== undefined) {
      TabManager.activate(existing);
      return;
    }
    const id = TabManager.store.add({
      kind: 'internal',
      title: TabManager.internalTitle(url),
      url,
      isLoading: false,
      faviconUrl: null,
    });
    TabManager.activate(id);
  }

  private static internalTitle(url: string): string {
    const r = mainStrings();
    if (url === INTERNAL_EXTENSIONS_URL) return r.extensions.title;
    if (url === INTERNAL_HISTORY_URL) return r.history.title;
    // An extension `page` surface (tepegoz://<extension-id>) is titled from the extension's manifest.
    const extId = extensionIdFromPageUrl(url);
    if (extId !== null) {
      const manifest = manifestById(extId);
      if (manifest !== undefined) return extensionLabel(manifest, mainLocale()).name;
    }
    return r.settings.title;
  }

  /** Open a fresh tab immediately to the right of `refId` and focus it (Chrome's "New tab to the right"). */
  static createTabRight(refId: string): void {
    if (!TabManager.store.has(refId)) return;
    const newId = TabManager.createTab();
    TabManager.store.placeAfter(newId, refId);
    TabManager.emitState();
  }

  /** Duplicate a tab's current URL into a new tab placed right after it, and focus it. */
  static duplicateTab(id: string): void {
    const rec = TabManager.store.get(id);
    if (rec === undefined) return;
    const view = TabManager.views.get(id);
    if (view === undefined) {
      TabManager.openInternalPage(rec.url); // internal page → just focus it (nothing to duplicate)
      return;
    }
    const url = view.webContents.getURL() || rec.url;
    const newId = TabManager.createTab(url.length > 0 ? url : undefined);
    TabManager.store.placeAfter(newId, id);
    TabManager.emitState();
  }

  /** Close every tab except `id`, keeping `id` active. */
  static closeOtherTabs(id: string): void {
    if (!TabManager.store.has(id)) return;
    if (TabManager.store.activeId !== id) TabManager.activate(id);
    for (const other of TabManager.store.ids().filter((k) => k !== id)) {
      TabManager.closeTab(other);
    }
  }

  /** Close all tabs ordered after `id`. */
  static closeTabsToRight(id: string): void {
    const ids = TabManager.store.ids();
    const idx = ids.indexOf(id);
    if (idx === -1) return;
    const toClose = ids.slice(idx + 1);
    // If the active tab is being closed, fall back to the reference tab first.
    const activeId = TabManager.store.activeId;
    if (activeId !== null && toClose.includes(activeId)) {
      TabManager.activate(id);
    }
    for (const k of toClose) TabManager.closeTab(k);
  }

  static navigateActive(rawUrl: string): void {
    // Internal pages (tepegoz://…) open as their own tab, rendered by the trusted chrome.
    const internal = internalPageUrl(rawUrl);
    if (internal !== null) {
      TabManager.openInternalPage(internal);
      return;
    }
    const rec = TabManager.store.active();
    if (rec === undefined) return;
    const url = toNavigationUrl(rawUrl, NEW_TAB_URL);
    const view = TabManager.views.get(rec.id);
    if (view === undefined) {
      TabManager.createTab(url); // typing a URL while on an internal page opens a new web tab
      return;
    }
    void view.webContents.loadURL(url).catch((err: unknown) => {
      Logger.warn('Navigation failed', { url, err: String(err) });
    });
  }

  static goBack(): void {
    const wc = TabManager.activeView()?.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  static goForward(): void {
    const wc = TabManager.activeView()?.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  static reloadActive(): void {
    TabManager.activeView()?.webContents.reload();
  }

  /** The content area (below the chrome), in DIP, as measured by the renderer. */
  static setContentBounds(bounds: Rectangle): void {
    TabManager.bounds = bounds;
    if (TabManager.contentVisible) {
      TabManager.activeView()?.setBounds(bounds);
    }
  }

  /** Hide the active web view so a chrome-rendered overlay (Agent Console) shows through. Internal
   *  tabs have no view, so this is a no-op for them. */
  static setContentVisible(visible: boolean): void {
    const win = TabManager.requireWin();
    TabManager.contentVisible = visible;
    const view = TabManager.activeView();
    if (view === undefined) return;
    if (visible) {
      win.contentView.addChildView(view);
      view.setBounds(TabManager.bounds);
    } else {
      win.contentView.removeChildView(view);
    }
  }

  static getState(): TabsState {
    const wc = TabManager.activeView()?.webContents;
    return TabManager.store.toState({
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
    });
  }

  /** The active tab's WebContentsView, or undefined for no-active / internal (view-less) tabs. */
  private static activeView(): WebContentsView | undefined {
    const id = TabManager.store.activeId;
    return id !== null ? TabManager.views.get(id) : undefined;
  }

  /** The active tab's webContents, for the agent perception layer (read DOM text). Null if none or
   *  destroyed. The agent reads through this; it never gets the chrome's webContents or contextBridge. */
  static activeWebContents(): WebContents | null {
    const wc = TabManager.activeView()?.webContents;
    return wc !== undefined && !wc.isDestroyed() ? wc : null;
  }

  /** Snapshot the active web view as a PNG data URL (null for internal/no-view tabs or on failure).
   *  The chrome shows this still while the live view is momentarily hidden (e.g. a sidebar resize),
   *  so the page never blanks to the chrome background. */
  static async captureActive(): Promise<string | null> {
    const wc = TabManager.activeWebContents();
    if (wc === null) return null;
    try {
      const image = await wc.capturePage();
      return image.isEmpty() ? null : image.toDataURL();
    } catch {
      return null;
    }
  }

  /** Apply a resolved User-Agent to every open web tab and reload it so the new identity takes effect
   *  immediately (the session default already covers tabs opened afterwards). Internal tabs have no
   *  web view and are skipped. */
  static applyUserAgent(ua: string): void {
    for (const view of TabManager.views.values()) {
      const wc = view.webContents;
      if (!wc.isDestroyed()) {
        wc.setUserAgent(ua);
        wc.reload();
      }
    }
  }

  private static requireWin(): BrowserWindow {
    if (TabManager.win === null) throw new Error('TabManager not attached to a window');
    return TabManager.win;
  }

  private static wireView(id: string, view: WebContentsView): void {
    const wc = view.webContents;

    // Browsed pages are untrusted. New windows open as tabs ONLY for http(s) URLs (no file:/custom
    // schemes); a popup from a non-foreground tab opens in the background and must not steal focus.
    wc.setWindowOpenHandler(({ url }) => {
      if (isWebUrl(url)) {
        TabManager.createTab(url, { background: id !== TabManager.store.activeId });
      }
      return { action: 'deny' };
    });
    // Block dangerous schemes on BOTH initial navigations and server-side redirects (will-navigate
    // alone misses redirect hops). The programmatic loadURL path is guarded by toNavigationUrl.
    const blockNonWeb = (event: { preventDefault: () => void }, url: string): void => {
      if (!/^(https?:|about:)/i.test(url)) event.preventDefault();
    };
    wc.on('will-navigate', blockNonWeb);
    wc.on('will-redirect', blockNonWeb);

    const sync = (): void => {
      TabManager.store.update(id, {
        url: wc.getURL(),
        title: wc.getTitle(),
        isLoading: wc.isLoadingMainFrame(),
      });
      TabManager.emitState();
    };
    wc.on('page-title-updated', (_e, title) => {
      TabManager.store.update(id, { title });
      const db = getDb();
      const url = wc.getURL();
      if (db !== null && isWebUrl(url)) HistoryStore.setTitle(db, url, title);
      TabManager.emitState();
    });
    // Electron sends every favicon a page declares; the last is typically the largest/most specific.
    wc.on('page-favicon-updated', (_e, favicons) => {
      TabManager.store.update(id, { faviconUrl: favicons.at(-1) ?? null });
      TabManager.emitState();
    });
    wc.on('did-start-loading', () => {
      TabManager.store.update(id, { isLoading: true });
      TabManager.emitState();
    });
    wc.on('did-stop-loading', sync);
    // A committed top-level navigation means a new document — drop the old favicon so a stale icon
    // from the previous page can't linger (the new one arrives via page-favicon-updated).
    wc.on('did-navigate', () => {
      TabManager.store.update(id, { faviconUrl: null });
    });
    // Record the visit in browsing history (once per committed top-level navigation). Only http(s);
    // no-op when the DB connector is unavailable. The title is refined later via page-title-updated.
    wc.on('did-navigate', (_e, url) => {
      const db = getDb();
      if (db !== null && isWebUrl(url)) {
        HistoryStore.record(db, { url, title: wc.getTitle() || url, ts: Date.now() });
      }
    });
    wc.on('did-navigate', sync);
    wc.on('did-navigate-in-page', sync);
  }

  private static emitState(): void {
    const win = TabManager.win;
    if (win && !win.isDestroyed()) {
      win.webContents.send(IpcChannels.tabsState, TabManager.getState());
    }
  }
}
