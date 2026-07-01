import { BrowserWindow, WebContentsView, type Rectangle, type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  IpcChannels,
  type TabInfo,
  type TabsState,
} from '@tepegoz/desktop-ipc';
import { HistoryStore } from '@tepegoz/persistence';
import { internalPageUrl, isWebUrl, toNavigationUrl } from './lib/navigation-url';
import { mainLocale, mainResources } from './lib/i18n-main';
import { extensionIdFromPageUrl, extensionLabel, manifestById } from '../shared/extensions';
import { getDb } from './db/database.electron';

/**
 * L0 tab model. Each tab is an isolated `WebContentsView` in a SEPARATE browsing partition
 * (`persist:tepegoz-web`) from the app chrome (`persist:tepegoz-app`) — browsed pages are untrusted
 * and never share the chrome's session or get the contextBridge. The chrome (tab strip + omnibox)
 * lives in the window's own webContents; the active tab's view is laid into the content area below
 * the chrome using bounds reported by the renderer.
 *
 * Per-site partition isolation, profiles, and checkpoint/resume are later phases; this is the minimal
 * real browser core for Phase 1a.
 */
const NEW_TAB_URL = 'https://duckduckgo.com/';
/** The isolated session partition every browsed page lives in (shared with the User-Agent switcher). */
export const BROWSING_PARTITION = 'persist:tepegoz-web';

interface Tab {
  id: string;
  /** null for INTERNAL pages (tepegoz://settings) — rendered by the chrome, not a web view. */
  view: WebContentsView | null;
  kind: 'web' | 'internal';
  title: string;
  url: string;
  isLoading: boolean;
  faviconUrl: string | null;
}

export default class TabManager {
  private static win: BrowserWindow | null = null;
  private static readonly tabs = new Map<string, Tab>();
  private static activeId: string | null = null;
  private static bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  private static contentVisible = true;
  private static nextId = 1;

  static attach(win: BrowserWindow): void {
    TabManager.win = win;
  }

  /** Tear down all tabs + state when the window closes (prevents stale tabs leaking into a
   *  re-created window, e.g. macOS app 'activate'). */
  static reset(): void {
    for (const tab of TabManager.tabs.values()) {
      if (tab.view !== null && !tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    }
    TabManager.tabs.clear();
    TabManager.activeId = null;
    TabManager.win = null;
    TabManager.contentVisible = true;
    TabManager.bounds = { x: 0, y: 0, width: 0, height: 0 };
  }

  static createTab(rawUrl?: string, opts?: { background?: boolean }): string {
    TabManager.requireWin(); // fail fast if not attached to a window
    const id = String(TabManager.nextId++);
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        partition: BROWSING_PARTITION,
      },
    });
    const tab: Tab = { id, view, kind: 'web', title: '', url: '', isLoading: true, faviconUrl: null };
    TabManager.tabs.set(id, tab);
    TabManager.wireView(tab, view);

    const target = rawUrl !== undefined ? toNavigationUrl(rawUrl, NEW_TAB_URL) : NEW_TAB_URL;
    void view.webContents.loadURL(target).catch((err: unknown) => {
      Logger.warn('Tab failed to load', { url: target, err: String(err) });
    });

    // Background tabs (e.g. a non-foreground page's window.open) must NOT steal the foreground.
    if (opts?.background === true && TabManager.activeId !== null) {
      TabManager.emitState();
    } else {
      TabManager.activate(id);
    }
    return id;
  }

  static activate(id: string): void {
    const win = TabManager.requireWin();
    const tab = TabManager.tabs.get(id);
    if (!tab) return;

    // Detach the previously-active view (kept alive in the background), attach the new one. Internal
    // tabs have no view — the chrome renders their page over the (empty) content area.
    if (TabManager.activeId !== null && TabManager.activeId !== id) {
      const prev = TabManager.tabs.get(TabManager.activeId);
      if (prev?.view != null) win.contentView.removeChildView(prev.view);
    }
    TabManager.activeId = id;
    if (TabManager.contentVisible && tab.view !== null) {
      win.contentView.addChildView(tab.view);
      tab.view.setBounds(TabManager.bounds);
    }
    TabManager.emitState();
  }

  static closeTab(id: string): void {
    const win = TabManager.requireWin();
    const tab = TabManager.tabs.get(id);
    if (!tab) return;
    if (tab.view !== null) {
      win.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    }
    TabManager.tabs.delete(id);

    if (TabManager.activeId === id) {
      TabManager.activeId = null;
      const next = [...TabManager.tabs.keys()].at(-1);
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
    TabManager.tabs.get(id)?.view?.webContents.reload();
  }

  /** Open (or focus) an internal page tab (tepegoz://settings, tepegoz://extensions) — rendered by
   *  the chrome, no web view. A new-tab experience for internal pages, mirroring Chrome's chrome://. */
  static openInternalPage(url: string): void {
    TabManager.requireWin();
    for (const [existingId, tab] of TabManager.tabs) {
      if (tab.kind === 'internal' && tab.url === url) {
        TabManager.activate(existingId);
        return;
      }
    }
    const id = String(TabManager.nextId++);
    TabManager.tabs.set(id, {
      id,
      view: null,
      kind: 'internal',
      title: TabManager.internalTitle(url),
      url,
      isLoading: false,
      faviconUrl: null,
    });
    TabManager.activate(id);
  }

  private static internalTitle(url: string): string {
    const r = mainResources();
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
    if (!TabManager.tabs.has(refId)) return;
    const newId = TabManager.createTab();
    TabManager.placeAfter(newId, refId);
    TabManager.emitState();
  }

  /** Duplicate a tab's current URL into a new tab placed right after it, and focus it. */
  static duplicateTab(id: string): void {
    const src = TabManager.tabs.get(id);
    if (!src) return;
    if (src.view === null) {
      TabManager.openInternalPage(src.url); // internal page → just focus it (nothing to duplicate)
      return;
    }
    const url = src.view.webContents.getURL() || src.url;
    const newId = TabManager.createTab(url.length > 0 ? url : undefined);
    TabManager.placeAfter(newId, id);
    TabManager.emitState();
  }

  /** Close every tab except `id`, keeping `id` active. */
  static closeOtherTabs(id: string): void {
    if (!TabManager.tabs.has(id)) return;
    if (TabManager.activeId !== id) TabManager.activate(id);
    for (const other of [...TabManager.tabs.keys()].filter((k) => k !== id)) {
      TabManager.closeTab(other);
    }
  }

  /** Close all tabs ordered after `id`. */
  static closeTabsToRight(id: string): void {
    const ids = [...TabManager.tabs.keys()];
    const idx = ids.indexOf(id);
    if (idx === -1) return;
    const toClose = ids.slice(idx + 1);
    // If the active tab is being closed, fall back to the reference tab first.
    if (TabManager.activeId !== null && toClose.includes(TabManager.activeId)) {
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
    const tab = TabManager.active();
    if (!tab) return;
    const url = toNavigationUrl(rawUrl, NEW_TAB_URL);
    if (tab.view === null) {
      TabManager.createTab(url); // typing a URL while on an internal page opens a new web tab
      return;
    }
    void tab.view.webContents.loadURL(url).catch((err: unknown) => {
      Logger.warn('Navigation failed', { url, err: String(err) });
    });
  }

  static goBack(): void {
    const wc = TabManager.active()?.view?.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  static goForward(): void {
    const wc = TabManager.active()?.view?.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  static reloadActive(): void {
    TabManager.active()?.view?.webContents.reload();
  }

  /** The content area (below the chrome), in DIP, as measured by the renderer. */
  static setContentBounds(bounds: Rectangle): void {
    TabManager.bounds = bounds;
    if (TabManager.contentVisible) {
      TabManager.active()?.view?.setBounds(bounds);
    }
  }

  /** Hide the active web view so a chrome-rendered overlay (Agent Console) shows through. Internal
   *  tabs have no view, so this is a no-op for them. */
  static setContentVisible(visible: boolean): void {
    const win = TabManager.requireWin();
    TabManager.contentVisible = visible;
    const tab = TabManager.active();
    if (!tab || tab.view === null) return;
    if (visible) {
      win.contentView.addChildView(tab.view);
      tab.view.setBounds(TabManager.bounds);
    } else {
      win.contentView.removeChildView(tab.view);
    }
  }

  static getState(): TabsState {
    const tabs: TabInfo[] = [...TabManager.tabs.values()].map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      isLoading: t.isLoading,
      faviconUrl: t.faviconUrl,
    }));
    const active = TabManager.active();
    return {
      tabs,
      activeId: TabManager.activeId,
      canGoBack: active?.view?.webContents.navigationHistory.canGoBack() ?? false,
      canGoForward: active?.view?.webContents.navigationHistory.canGoForward() ?? false,
    };
  }

  /** Reorder the (insertion-ordered) tab map so `movedId` sits immediately after `refId`. */
  private static placeAfter(movedId: string, refId: string): void {
    if (movedId === refId) return;
    const moved = TabManager.tabs.get(movedId);
    if (!moved) return;
    const entries = [...TabManager.tabs.entries()].filter(([k]) => k !== movedId);
    const idx = entries.findIndex(([k]) => k === refId);
    entries.splice(idx === -1 ? entries.length : idx + 1, 0, [movedId, moved]);
    TabManager.tabs.clear();
    for (const [k, v] of entries) TabManager.tabs.set(k, v);
  }

  private static active(): Tab | undefined {
    return TabManager.activeId !== null ? TabManager.tabs.get(TabManager.activeId) : undefined;
  }

  /** The active tab's webContents, for the agent perception layer (read DOM text). Null if none or
   *  destroyed. The agent reads through this; it never gets the chrome's webContents or contextBridge. */
  static activeWebContents(): WebContents | null {
    const wc = TabManager.active()?.view?.webContents;
    return wc !== undefined && !wc.isDestroyed() ? wc : null;
  }

  /** Apply a resolved User-Agent to every open web tab and reload it so the new identity takes effect
   *  immediately (the session default already covers tabs opened afterwards). Internal tabs have no
   *  web view and are skipped. */
  static applyUserAgent(ua: string): void {
    for (const tab of TabManager.tabs.values()) {
      const wc = tab.view?.webContents;
      if (wc !== undefined && !wc.isDestroyed()) {
        wc.setUserAgent(ua);
        wc.reload();
      }
    }
  }

  private static requireWin(): BrowserWindow {
    if (TabManager.win === null) throw new Error('TabManager not attached to a window');
    return TabManager.win;
  }

  private static wireView(tab: Tab, view: WebContentsView): void {
    const wc = view.webContents;

    // Browsed pages are untrusted. New windows open as tabs ONLY for http(s) URLs (no file:/custom
    // schemes); a popup from a non-foreground tab opens in the background and must not steal focus.
    wc.setWindowOpenHandler(({ url }) => {
      if (isWebUrl(url)) {
        TabManager.createTab(url, { background: tab.id !== TabManager.activeId });
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
      tab.url = wc.getURL();
      tab.title = wc.getTitle();
      tab.isLoading = wc.isLoadingMainFrame();
      TabManager.emitState();
    };
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title;
      const db = getDb();
      const url = wc.getURL();
      if (db !== null && isWebUrl(url)) HistoryStore.setTitle(db, url, title);
      TabManager.emitState();
    });
    // Electron sends every favicon a page declares; the last is typically the largest/most specific.
    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.faviconUrl = favicons.at(-1) ?? null;
      TabManager.emitState();
    });
    wc.on('did-start-loading', () => {
      tab.isLoading = true;
      TabManager.emitState();
    });
    wc.on('did-stop-loading', sync);
    // A committed top-level navigation means a new document — drop the old favicon so a stale icon
    // from the previous page can't linger (the new one arrives via page-favicon-updated).
    wc.on('did-navigate', () => {
      tab.faviconUrl = null;
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
