import { BrowserWindow, WebContentsView, type Rectangle } from 'electron';
import { Logger } from '@tepegoz/libs';
import { IpcChannels, type TabInfo, type TabsState } from '../shared/ipc-contract';

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
const BROWSING_PARTITION = 'persist:tepegoz-web';

interface Tab {
  id: string;
  view: WebContentsView;
  title: string;
  url: string;
  isLoading: boolean;
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

  /** Convert omnibox input into a navigable URL: a scheme passes through, a bare domain gets https://,
   *  anything else becomes a search query (DuckDuckGo). */
  static toNavigationUrl(input: string): string {
    const s = input.trim();
    if (s.length === 0) return NEW_TAB_URL;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || s.startsWith('about:')) return s;
    if (!s.includes(' ') && /^[^\s.]+\.[^\s]{2,}(\/.*)?$/.test(s)) return `https://${s}`;
    return `https://duckduckgo.com/?q=${encodeURIComponent(s)}`;
  }

  static createTab(rawUrl?: string): string {
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
    const tab: Tab = { id, view, title: '', url: '', isLoading: true };
    TabManager.tabs.set(id, tab);
    TabManager.wireView(tab);

    const target = rawUrl !== undefined ? TabManager.toNavigationUrl(rawUrl) : NEW_TAB_URL;
    void view.webContents.loadURL(target).catch((err: unknown) => {
      Logger.warn('Tab failed to load', { url: target, err: String(err) });
    });

    TabManager.activate(id);
    return id;
  }

  static activate(id: string): void {
    const win = TabManager.requireWin();
    const tab = TabManager.tabs.get(id);
    if (!tab) return;

    // Detach the previously-active view (kept alive in the background), attach the new one.
    if (TabManager.activeId !== null && TabManager.activeId !== id) {
      const prev = TabManager.tabs.get(TabManager.activeId);
      if (prev) win.contentView.removeChildView(prev.view);
    }
    TabManager.activeId = id;
    if (TabManager.contentVisible) {
      win.contentView.addChildView(tab.view);
      tab.view.setBounds(TabManager.bounds);
    }
    TabManager.emitState();
  }

  static closeTab(id: string): void {
    const win = TabManager.requireWin();
    const tab = TabManager.tabs.get(id);
    if (!tab) return;
    win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
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

  static navigateActive(rawUrl: string): void {
    const tab = TabManager.active();
    if (!tab) return;
    const url = TabManager.toNavigationUrl(rawUrl);
    void tab.view.webContents.loadURL(url).catch((err: unknown) => {
      Logger.warn('Navigation failed', { url, err: String(err) });
    });
  }

  static goBack(): void {
    const wc = TabManager.active()?.view.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  static goForward(): void {
    const wc = TabManager.active()?.view.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  static reloadActive(): void {
    TabManager.active()?.view.webContents.reload();
  }

  /** The content area (below the chrome), in DIP, as measured by the renderer. */
  static setContentBounds(bounds: Rectangle): void {
    TabManager.bounds = bounds;
    if (TabManager.contentVisible) {
      TabManager.active()?.view.setBounds(bounds);
    }
  }

  /** Hide the web view so a chrome-rendered overlay (e.g. Settings) shows through. */
  static setContentVisible(visible: boolean): void {
    const win = TabManager.requireWin();
    TabManager.contentVisible = visible;
    const tab = TabManager.active();
    if (!tab) return;
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
    }));
    const active = TabManager.active();
    return {
      tabs,
      activeId: TabManager.activeId,
      canGoBack: active?.view.webContents.navigationHistory.canGoBack() ?? false,
      canGoForward: active?.view.webContents.navigationHistory.canGoForward() ?? false,
    };
  }

  private static active(): Tab | undefined {
    return TabManager.activeId !== null ? TabManager.tabs.get(TabManager.activeId) : undefined;
  }

  private static requireWin(): BrowserWindow {
    if (TabManager.win === null) throw new Error('TabManager not attached to a window');
    return TabManager.win;
  }

  private static wireView(tab: Tab): void {
    const wc = tab.view.webContents;

    // Browsed pages are untrusted: open new windows as new tabs; allow only web/about/data navigation.
    wc.setWindowOpenHandler(({ url }) => {
      TabManager.createTab(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (event, url) => {
      if (!/^(https?:|about:|data:)/i.test(url)) event.preventDefault();
    });

    const sync = (): void => {
      tab.url = wc.getURL();
      tab.title = wc.getTitle();
      tab.isLoading = wc.isLoadingMainFrame();
      TabManager.emitState();
    };
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title;
      TabManager.emitState();
    });
    wc.on('did-start-loading', () => {
      tab.isLoading = true;
      TabManager.emitState();
    });
    wc.on('did-stop-loading', sync);
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
