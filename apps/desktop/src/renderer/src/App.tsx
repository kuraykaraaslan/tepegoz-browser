import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { coreDict, localeDir, pick, resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider } from '@tepegoz/i18n/react';
import { Modal } from '@tepegoz/ui';
import { browserDict, sidebarDict } from '../../i18n';
import {
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_SETTINGS_URL,
  isExtensionEnabled,
} from '@tepegoz/desktop-ipc';
import type {
  AppNotification,
  ContentBounds,
  CredentialsStatus,
  ExtensionId,
  LocalePref,
  Preferences,
  ProviderId,
  TabsState,
  ThemePref,
} from '@tepegoz/desktop-ipc';
import { ToastStack } from '@tepegoz/notifications-ui';
import { extensionIdFromPageUrl, extensionLabel, extensionPageUrl } from '../../shared/extensions';
import { EXTENSIONS, extensionDefById } from './extensions/registry';
import { BrowserChrome } from '@tepegoz/browser-chrome';
import {
  buildOmniboxSuggestions,
  parseOmniboxQuery,
  type OmniboxSuggestion,
} from '@tepegoz/omnibox';
import { HistoryPage } from '@tepegoz/history-ui';
import { ExtensionsPage } from './components/ExtensionsPage';
import { ExtensionTray } from './components/ExtensionTray';
import { MainMenuButton } from './components/MainMenuButton';
import { NotificationBellButton } from './components/NotificationBellButton';
import { SettingsPage } from './components/SettingsPage';
import { useWindowMaximized } from './lib/useWindowMaximized';

/** The overlay surface kinds (everything except `page`, which opens as its own internal tab). */
type OverlaySurfaceKind = 'popup' | 'modal' | 'panel';
interface ActiveSurface {
  id: string;
  kind: OverlaySurfaceKind;
}

function effectiveLocale(pref: LocalePref): Locale {
  if (pref === 'en' || pref === 'tr') return pref;
  return resolveLocale(navigator.language);
}

function applyTheme(theme: ThemePref): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

const EMPTY_TABS: TabsState = { tabs: [], activeId: null, canGoBack: false, canGoForward: false };

/** Sidebar dock width bounds (px); the user drags the edge to resize between these. */
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 640;
const SIDEBAR_DEFAULT_WIDTH = 360;

/** Fallback anchor for a popup opened without an icon rect (e.g. from the hamburger menu): the
 *  top-right of the content, just under the chrome. */
function defaultPopupAnchor(): ContentBounds {
  return { x: window.innerWidth - 8, y: 84, width: 0, height: 0 };
}

export function App() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [tabs, setTabs] = useState<TabsState>(EMPTY_TABS);
  // The extension surface currently overlaid on the content area (popup/modal/panel), or null. A `page`
  // action opens an internal tab instead, so it never lives here.
  const [activeSurface, setActiveSurface] = useState<ActiveSurface | null>(null);
  // The extension docked in the resizable sidebar (persists across tab switches, Chrome-style), or null.
  const [sidebarExtId, setSidebarExtId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  // A still PNG of the page shown in place of the (briefly hidden) live web view during a resize drag,
  // so the page never blanks to the chrome background. Null when not dragging / no capturable page.
  const [resizeSnapshot, setResizeSnapshot] = useState<string | null>(null);
  const draggingSidebarRef = useRef(false);
  // The extension whose native popup window is open (for the toolbar-icon pressed state), or null.
  const [popupOpenId, setPopupOpenId] = useState<string | null>(null);
  const popupOpenIdRef = useRef<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Transient toasts pushed from NotificationHost (channel `toast`); capped, oldest dropped.
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const locale = effectiveLocale(prefs?.locale ?? 'system');

  const closeSurface = useCallback(() => {
    setActiveSurface(null);
  }, []);

  // Resolve a toolbar icon click/double-click (or a menu request) to its bound surface. `anchor` is the
  // clicked icon's rect (for popups); absent for menu-triggered actions.
  const runExtensionAction = useCallback(
    (id: string, trigger: 'click' | 'doubleClick', anchor?: ContentBounds) => {
      const def = extensionDefById(id);
      if (def === undefined) return;
      const action =
        trigger === 'click' ? def.manifest.actions.click : def.manifest.actions.doubleClick;
      if (action === undefined) return;
      if (action === 'page') {
        setActiveSurface(null);
        window.tepegoz.navigateTab(extensionPageUrl(id)); // opens/focuses the extension's internal tab
        return;
      }
      if (action === 'sidebar') {
        // A dock beside the page (web view stays visible); persists across tabs, toggles on re-trigger.
        setSidebarExtId((cur) => (cur === id ? null : id));
        return;
      }
      if (action === 'popup') {
        // A native floating window that keeps the page live behind it. Re-triggering toggles it off.
        if (popupOpenIdRef.current === id) {
          window.tepegoz.closePopup();
          setPopupOpenId(null);
        } else {
          window.tepegoz.openPopup('ext', anchor ?? defaultPopupAnchor(), { id });
          setPopupOpenId(id);
        }
        return;
      }
      // Remaining overlay surfaces (modal/panel) hide the web view. Toggle: re-triggering closes it.
      setActiveSurface((cur) =>
        cur !== null && cur.id === id && cur.kind === action ? null : { id, kind: action },
      );
    },
    [],
  );

  // Drag the sidebar's inner edge to resize (clamped). The native web view swallows pointer events when
  // the cursor crosses over it, so we briefly hide it and let the chrome capture the drag — but we show
  // a still snapshot of the page in its place first, so it never blanks to the chrome background.
  function onSidebarResizeStart(e: ReactPointerEvent): void {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    draggingSidebarRef.current = true;
    const onMove = (ev: PointerEvent): void => {
      const next = startWidth + (startX - ev.clientX); // drag left → wider
      setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next)));
    };
    const onUp = (): void => {
      draggingSidebarRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizingSidebar(false);
      setResizeSnapshot(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // Capture the page FIRST, then hide the live view — no navy flash. If the drag already ended (fast
    // click) or there's nothing to capture, we still hide so the drag tracks reliably.
    window.tepegoz
      .captureActiveTab()
      .then((snap) => {
        if (!draggingSidebarRef.current) return;
        setResizeSnapshot(snap);
        setResizingSidebar(true);
      })
      .catch(() => {
        if (draggingSidebarRef.current) setResizingSidebar(true);
      });
  }

  useEffect(() => {
    void (async () => {
      try {
        const [p, s, ts] = await Promise.all([
          window.tepegoz.getPreferences(),
          window.tepegoz.getCredentialsStatus(),
          window.tepegoz.getTabsState(),
        ]);
        setPrefs(p);
        setStatus(s);
        setTabs(ts);
      } catch (err) {
        // Preload bridge unavailable (dev mishap) — leave defaults; the chrome still renders.
        console.warn('Initial IPC state fetch failed — rendering with defaults', err);
      }
    })();
    return window.tepegoz.onTabsState(setTabs);
  }, []);

  // Transient toasts: append each pushed toast (capped to the newest 3; individual auto-dismiss timers
  // live in the ToastStack).
  useEffect(() => {
    return window.tepegoz.onNotificationToast((toast) => {
      setToasts((prev) => [...prev, toast].slice(-3));
    });
  }, []);

  // RTL-ready: mirror the active locale's writing direction onto <html dir> (both shipping locales are
  // LTR, so this is a no-op today, but the whole surface is wired for a future RTL locale — ADR-0016).
  useEffect(() => {
    document.documentElement.dir = localeDir(locale);
  }, [locale]);

  const theme = prefs?.theme ?? 'system';
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, [theme]);

  // Tell main where to lay out the active tab's web view (the content area below the chrome).
  useEffect(() => {
    const el = contentRef.current;
    if (el === null) return undefined;
    const report = (): void => {
      const r = el.getBoundingClientRect();
      window.tepegoz.setContentBounds({
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
    };
  }, []);

  // Overlay surfaces (popup/modal/panel) are chrome-rendered and hide the active web view while open.
  // A sidebar resize also hides it momentarily so the chrome captures the drag's pointer stream (the
  // native web view otherwise swallows pointer events once the cursor crosses over it).
  useEffect(() => {
    window.tepegoz.setContentVisible(activeSurface === null && !resizingSidebar);
  }, [activeSurface, resizingSidebar]);

  // Escape closes the open overlay surface (the Modal also self-handles Escape — both are idempotent).
  useEffect(() => {
    if (activeSurface === null) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setActiveSurface(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [activeSurface]);

  // The native menu's Extensions submenu asks the chrome to open an extension (its click surface).
  useEffect(() => {
    return window.tepegoz.onOpenExtension((id) => {
      runExtensionAction(id, 'click');
    });
  }, [runExtensionAction]);

  // Keep the popup-open ref in sync (read by runExtensionAction to toggle without stale closures).
  useEffect(() => {
    popupOpenIdRef.current = popupOpenId;
  }, [popupOpenId]);

  // The native popup closed itself (click-away / Escape / its Close button) — clear the pressed state.
  useEffect(() => {
    return window.tepegoz.onPopupClosed((surface) => {
      if (surface.startsWith('ext:')) setPopupOpenId(null);
    });
  }, []);

  // App shortcuts (single registry): the accelerators shown in the main menu are wired here. We
  // preventDefault so Ctrl+R reloads the active TAB, not the app chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 't' && e.shiftKey) {
        e.preventDefault();
        setActiveSurface(null);
        window.tepegoz.reopenClosedTab(); // Ctrl+Shift+T — reopen the last-closed tab
      } else if (key === 't') {
        e.preventDefault();
        setActiveSurface(null);
        window.tepegoz.createTab();
      } else if (key === 'r') {
        e.preventDefault();
        window.tepegoz.tabReload();
      } else if (key === ',') {
        e.preventDefault();
        setActiveSurface(null);
        window.tepegoz.navigateTab(INTERNAL_SETTINGS_URL); // opens/focuses the Settings tab
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const isMaximized = useWindowMaximized();
  // App mounts the <I18nProvider> in its own return, so it sits ABOVE its own provider — it therefore
  // resolves the strings it renders itself with `pick(dict, locale)` (not the `useT` hook). Child
  // components/surfaces render under the provider and self-localize via `useT`.
  const coreT = pick(coreDict, locale);
  const browserT = pick(browserDict, locale);
  const sidebarT = pick(sidebarDict, locale);
  const activeTab = tabs.tabs.find((tb) => tb.id === tabs.activeId);
  const currentUrl = activeTab?.url ?? '';
  // Internal pages are tabs addressed tepegoz://… ; render them when active.
  const settingsActive = activeTab?.url === INTERNAL_SETTINGS_URL;
  const extensionsActive = activeTab?.url === INTERNAL_EXTENSIONS_URL;
  const historyActive = activeTab?.url === INTERNAL_HISTORY_URL;
  // An extension `page` surface: tepegoz://<extension-id> → render that extension's page component.
  const pageExtId = activeTab !== undefined ? extensionIdFromPageUrl(activeTab.url) : null;
  const PageSurface = pageExtId !== null ? extensionDefById(pageExtId)?.surfaces.page : undefined;
  // The extension docked in the sidebar (if any) and its sidebar surface renderer.
  const sidebarDef = sidebarExtId !== null ? extensionDefById(sidebarExtId) : undefined;
  const SidebarSurface = sidebarDef?.surfaces.sidebar;

  const extensionStates = prefs?.extensions ?? [];
  const enabledExtensions = EXTENSIONS.filter((ext) => isExtensionEnabled(extensionStates, ext.id));

  // Deterministic omnibox suggestions (history + bookmarks + open tabs + navigate/search). Refs keep the
  // injected callbacks stable so the Omnibox effect doesn't refetch every render; they mirror latest state.
  const tabsRef = useRef(tabs);
  const bookmarksRef = useRef<{ url: string; title: string }[]>([]);
  const suggestLabelsRef = useRef({
    search: browserT.omniboxSearchHint,
    switchToTab: browserT.omniboxSwitchToTab,
    bookmark: browserT.omniboxBookmark,
  });
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  useEffect(() => {
    suggestLabelsRef.current = {
      search: browserT.omniboxSearchHint,
      switchToTab: browserT.omniboxSwitchToTab,
      bookmark: browserT.omniboxBookmark,
    };
  }, [browserT]);

  // Bookmark star state for the active tab + the cached bookmark list feeding omnibox suggestions.
  const [activeBookmarked, setActiveBookmarked] = useState(false);
  const canBookmark = /^https?:\/\//i.test(currentUrl);

  const refreshBookmarks = useCallback(async (): Promise<void> => {
    try {
      const list = await window.tepegoz.listBookmarks();
      bookmarksRef.current = list.map((b) => ({ url: b.url, title: b.title }));
    } catch {
      bookmarksRef.current = [];
    }
  }, []);

  useEffect(() => {
    void refreshBookmarks();
  }, [refreshBookmarks]);

  // Reflect whether the active page is bookmarked (drives the star's filled/outline state).
  useEffect(() => {
    if (!canBookmark) {
      setActiveBookmarked(false);
      return;
    }
    let cancelled = false;
    void window.tepegoz.isBookmarked(currentUrl).then(
      (b) => {
        if (!cancelled) setActiveBookmarked(b);
      },
      () => {
        if (!cancelled) setActiveBookmarked(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [currentUrl, canBookmark]);

  const onToggleBookmark = useCallback(async (): Promise<void> => {
    const tab = tabsRef.current.tabs.find((tb) => tb.id === tabsRef.current.activeId);
    const url = tab?.url ?? '';
    if (!/^https?:\/\//i.test(url)) return;
    try {
      const nowBookmarked = await window.tepegoz.toggleBookmark(url, tab?.title ?? url);
      setActiveBookmarked(nowBookmarked);
      await refreshBookmarks();
    } catch (err) {
      console.error('Bookmark toggle failed', err); // star state stays as-is (nothing was persisted)
    }
  }, [refreshBookmarks]);

  const onOmniboxSuggest = useCallback(async (query: string): Promise<OmniboxSuggestion[]> => {
    const { term } = parseOmniboxQuery(query);
    let history: Awaited<ReturnType<typeof window.tepegoz.searchHistory>> = [];
    try {
      history = term.length > 0 ? await window.tepegoz.searchHistory(term) : [];
    } catch {
      history = []; // history unavailable → still surface tabs/bookmarks + the navigate/search action
    }
    const state = tabsRef.current;
    return buildOmniboxSuggestions(
      query,
      {
        // Don't offer switching to the tab that's already active.
        tabs: state.tabs
          .filter((tb) => tb.id !== state.activeId)
          .map((tb) => ({ id: tb.id, title: tb.title, url: tb.url })),
        history: history.map((h) => ({ url: h.url, title: h.title, visitCount: h.visitCount })),
        bookmarks: bookmarksRef.current,
      },
      suggestLabelsRef.current,
    );
  }, []);

  const onActivateTabFromOmnibox = useCallback((tabId: string): void => {
    setActiveSurface(null);
    window.tepegoz.activateTab(tabId);
  }, []);

  // Stable data-source bindings for HistoryPage — it refetches when `list` changes identity.
  const historyList = useCallback(
    (q: string) => (q.length === 0 ? window.tepegoz.getHistory() : window.tepegoz.searchHistory(q)),
    [],
  );
  const historyRemove = useCallback((url: string) => window.tepegoz.deleteHistory(url), []);
  const historyClear = useCallback(() => window.tepegoz.clearHistory(), []);

  async function onUpdatePrefs(patch: Partial<Preferences>): Promise<void> {
    setPrefs(await window.tepegoz.updatePreferences(patch));
  }
  async function onSetKey(provider: ProviderId, apiKey: string): Promise<void> {
    setStatus(await window.tepegoz.setProviderKey(provider, apiKey));
  }
  async function onRemoveKey(provider: ProviderId): Promise<void> {
    setStatus(await window.tepegoz.removeProviderKey(provider));
  }
  function onToggleExtension(id: ExtensionId, enabled: boolean): void {
    const next = extensionStates.filter((e) => e.id !== id);
    next.push({ id, status: enabled ? 'enabled' : 'disabled' });
    onUpdatePrefs({ extensions: next }).catch((err: unknown) => {
      console.error('Extension toggle failed', err); // prefs unchanged in main → UI stays consistent
    });
    if (!enabled && activeSurface?.id === id) setActiveSurface(null);
    if (!enabled && sidebarExtId === id) setSidebarExtId(null);
  }

  /** Render the open overlay surface, wrapped per its kind (panel = full overlay, modal = centered
   *  dialog, popup = anchored card under the toolbar icons). */
  function renderActiveSurface(): ReactNode {
    if (activeSurface === null) return null;
    const def = extensionDefById(activeSurface.id);
    const Surface = def?.surfaces[activeSurface.kind];
    if (def === undefined || Surface === undefined) return null;
    const body = <Surface onClose={closeSurface} />;
    if (activeSurface.kind === 'panel') return body;
    if (activeSurface.kind === 'modal') {
      return (
        <Modal open onClose={closeSurface} ariaLabel={extensionLabel(def.manifest, locale).name}>
          {body}
        </Modal>
      );
    }
    return null; // popup opens as a native window (openPopup), not a DOM overlay
  }

  /** Render the resizable sidebar dock (right), if an extension is docked. The page/web view stays
   *  visible beside it — its bounds already exclude this strip because `contentRef` measures only the
   *  left region. */
  function renderSidebar(): ReactNode {
    if (sidebarDef === undefined || SidebarSurface === undefined) return null;
    return (
      <aside
        style={{ width: sidebarWidth }}
        className="relative flex shrink-0 border-l border-border bg-surface-base"
        aria-label={extensionLabel(sidebarDef.manifest, locale).name}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={sidebarT.resize}
          onPointerDown={onSidebarResizeStart}
          className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-border-focus"
        />
        <div className="relative flex-1 overflow-hidden">
          <SidebarSurface onClose={() => setSidebarExtId(null)} />
        </div>
      </aside>
    );
  }

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col bg-surface-base text-text-primary">
        <BrowserChrome
          t={{ common: coreT.common, window: coreT.window, browser: browserT }}
          tabs={tabs.tabs}
          activeTabId={tabs.activeId}
          onSelectTab={(id) => {
            setActiveSurface(null); // close any extension surface when switching tabs
            window.tepegoz.activateTab(id);
          }}
          onCloseTab={(id) => window.tepegoz.closeTab(id)}
          onTabContextMenu={(id) => window.tepegoz.showTabContextMenu(id)}
          onNewTab={() => {
            setActiveSurface(null);
            window.tepegoz.createTab();
          }}
          isMaximized={isMaximized}
          onMinimize={() => window.tepegoz.minimizeWindow()}
          onToggleMaximize={() => window.tepegoz.toggleMaximizeWindow()}
          onClose={() => window.tepegoz.closeWindow()}
          currentUrl={currentUrl}
          canGoBack={tabs.canGoBack}
          canGoForward={tabs.canGoForward}
          onBack={() => window.tepegoz.tabGoBack()}
          onForward={() => window.tepegoz.tabGoForward()}
          onReload={() => window.tepegoz.tabReload()}
          captionLeading={<NotificationBellButton />}
          menu={<MainMenuButton label={browserT.menu} extensionCount={enabledExtensions.length} />}
          onNavigate={(input) => window.tepegoz.navigateTab(input)}
          onSuggest={onOmniboxSuggest}
          onActivateTab={onActivateTabFromOmnibox}
          isBookmarked={activeBookmarked}
          canBookmark={canBookmark}
          onToggleBookmark={() => void onToggleBookmark()}
          toolbarActions={
            <ExtensionTray
              locale={locale}
              extensions={enabledExtensions}
              activeExtensionId={activeSurface?.id ?? sidebarExtId ?? popupOpenId ?? null}
              onExtensionAction={runExtensionAction}
            />
          }
        />
        <div className="relative flex flex-1 overflow-hidden">
          {/* Left region = the web-view area (its bounds are measured from contentRef, so they exclude
            the sidebar); the resizable sidebar dock sits to its right. */}
          <div ref={contentRef} className="relative flex-1 overflow-hidden">
            {/* The active tab's web page is a separate WebContentsView laid over this area by main. The
            internal app tabs (Settings/Extensions/History), extension `page` tabs, and open overlay
            surfaces have no web view, so the chrome renders them here instead. */}
            {resizeSnapshot !== null && (
              // A still of the page shown while the live web view is hidden during a sidebar resize drag.
              <img
                src={resizeSnapshot}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover object-left-top"
              />
            )}
            {settingsActive && (
              <div className="absolute inset-0 bg-surface-base">
                {prefs && status ? (
                  <SettingsPage
                    prefs={prefs}
                    status={status}
                    onUpdatePrefs={onUpdatePrefs}
                    onSetKey={onSetKey}
                    onRemoveKey={onRemoveKey}
                    getMcpStatus={() => window.tepegoz.getMcpStatus()}
                  />
                ) : (
                  <p className="px-6 py-8 text-sm text-text-secondary">…</p>
                )}
              </div>
            )}
            {extensionsActive && (
              <div className="absolute inset-0 bg-surface-base">
                <ExtensionsPage
                  locale={locale}
                  states={extensionStates}
                  onToggle={onToggleExtension}
                />
              </div>
            )}
            {historyActive && (
              <div className="absolute inset-0 bg-surface-base">
                <HistoryPage list={historyList} remove={historyRemove} clear={historyClear} />
              </div>
            )}
            {PageSurface !== undefined && (
              <div className="absolute inset-0 bg-surface-base">
                <PageSurface onClose={closeSurface} />
              </div>
            )}
            {renderActiveSurface()}
          </div>
          {renderSidebar()}
        </div>
        {/* Transient toast overlay (channel `toast`); native OS notifications cover the over-page case. */}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </I18nProvider>
  );
}
