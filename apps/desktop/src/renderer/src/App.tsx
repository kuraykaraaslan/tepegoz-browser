import {
  Suspense,
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
import { browserDict, sidebarDict, userMenuDict } from '../../i18n';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_SETTINGS_URL,
  isExtensionEnabled,
} from '@tepegoz/desktop-ipc';
import type {
  AppNotification,
  AutofillAvailablePayload,
  BookmarkMenuAction,
  BookmarkTreeNode,
  ContentBounds,
  CredentialsStatus,
  ExtensionId,
  LocalePref,
  LoginCredentialMeta,
  NotificationPermissionRequest,
  Preferences,
  ProviderId,
  TabsState,
} from '@tepegoz/desktop-ipc';
import { isBookmarkable, BOOKMARK_ROOT_BAR } from '@tepegoz/bookmarks';
import { NotificationPermissionPrompt, ToastStack } from '@tepegoz/notifications-ui';
import { AutofillSuggestion } from '@tepegoz/password-ui';
import { runNotificationAction } from './lib/notification-actions';
import {
  extensionIdFromPageUrl,
  extensionLabel,
  extensionPageUrl,
} from '../../shared/extension-urls';
import { extensionDefById } from './extensions/registry';
import { useExtensionCatalog } from './extensions/useExtensionCatalog';
import { BrowserChrome } from '@tepegoz/browser-chrome';
import { BookmarksBar } from '@tepegoz/bookmarks-bar';
import {
  buildOmniboxSuggestions,
  parseOmniboxQuery,
  type OmniboxSuggestion,
} from '@tepegoz/omnibox';
import { HistoryPage } from '@tepegoz/history-ui';
import { BookmarksManager } from '@tepegoz/bookmarks-ui';
import { ExtensionsPage } from './components/ExtensionsPage';
import { ExtensionTray } from './components/ExtensionTray';
import { MainMenuButton } from './components/MainMenuButton';
import { UserMenuButton } from './components/UserMenuButton';
import { NotificationBellButton } from './components/NotificationBellButton';
import { SettingsPage } from './components/SettingsPage';
import { CursorOverlay } from './components/CursorOverlay';
import { applyTheme } from './lib/theme';
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


const EMPTY_TABS: TabsState = {
  tabs: [],
  groups: [],
  activeId: null,
  canGoBack: false,
  canGoForward: false,
};

/** The Agent Console's extension id + the `TabGroupSettingKey` remembering its open/closed state per
 *  tab group (the existing sidebar toggle button doubles as the per-group control — no new UI). */
const AGENT_EXTENSION_ID = 'com.tepegoz.agent';
const AGENT_PANEL_OPEN_KEY = 'agent.panelOpen';

/** Sidebar dock width bounds (px); the user drags the edge to resize between these. */
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 640;
const SIDEBAR_DEFAULT_WIDTH = 360;

/** Fallback anchor for a popup opened without an icon rect (e.g. from the hamburger menu): the
 *  top-right of the content, just under the chrome. */
function defaultPopupAnchor(): ContentBounds {
  return { x: window.innerWidth - 8, y: 84, width: 0, height: 0 };
}

/** Centered-top anchor for a bookmark rename / add-folder dialog popup. `openPopup` right-aligns the
 *  popup to the anchor's right edge, so a full-dialog-width anchor centers the (same-width) dialog. */
function bookmarkDialogAnchor(): ContentBounds {
  const width = 320;
  return { x: Math.round(window.innerWidth / 2 - width / 2), y: 72, width, height: 0 };
}

export function App() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [tabs, setTabs] = useState<TabsState>(EMPTY_TABS);
  // A group whose inline rename editor should open (set by the native group menu's "Rename" push).
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
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
  // Pending per-site Web Notification consent prompt (from the main-process broker), or null.
  const [permReq, setPermReq] = useState<NotificationPermissionRequest | null>(null);
  // The "open all" confirmation is an in-renderer modal (rare, >15 bookmarks), so it must hide the native
  // web view while open (declared above the content-visibility effect that reads it). Rename / add-folder
  // are native popup windows instead (they float over the page — see openBookmarkDialog).
  const [openAllUrls, setOpenAllUrls] = useState<string[] | null>(null);
  // Autofill suggestions pushed from main when a page loads and has matching stored credentials.
  const [autofill, setAutofill] = useState<AutofillAvailablePayload | null>(null);
  // Cached credential list for the Passwords settings section.
  const [loginCredentials, setLoginCredentials] = useState<LoginCredentialMeta[]>([]);
  // Built-in extensions, fetched once over IPC (identity) + paired with lazy surfaces. Empty until it
  // resolves — the tray/menus tolerate an empty list the same way the UI tolerates `prefs === null`.
  const { registry } = useExtensionCatalog();

  const locale = effectiveLocale(prefs?.locale ?? 'system');

  // The active tab's group (null when ungrouped) + that group's remembered Agent Console open state.
  const activeGroupId = tabs.tabs.find((t) => t.id === tabs.activeId)?.groupId ?? null;
  const activeGroupAgentPanelOpen = tabs.groups.find((g) => g.id === activeGroupId)?.settings[
    AGENT_PANEL_OPEN_KEY
  ];

  // Restore the active tab group's own Agent Console open/closed state on switch. A group with no
  // explicit value yet (new group) is left alone — no forced default, no surprise toggle. Never yanks
  // away some other extension the user deliberately docked (only acts when the sidebar is empty or
  // already showing the agent).
  useEffect(() => {
    if (activeGroupId === null || activeGroupAgentPanelOpen === undefined) return;
    setSidebarExtId((cur) => {
      if (cur !== null && cur !== AGENT_EXTENSION_ID) return cur;
      return activeGroupAgentPanelOpen ? AGENT_EXTENSION_ID : null;
    });
  }, [activeGroupId, activeGroupAgentPanelOpen]);

  const closeSurface = useCallback(() => {
    setActiveSurface(null);
  }, []);

  // Resolve a toolbar icon click/double-click (or a menu request) to its bound surface. `anchor` is the
  // clicked icon's rect (for popups); absent for menu-triggered actions.
  const runExtensionAction = useCallback(
    (id: string, trigger: 'click' | 'doubleClick', anchor?: ContentBounds) => {
      const def = extensionDefById(registry, id);
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
        // A dock beside the page (web view stays visible); toggles on re-trigger. For the Agent Console
        // specifically, also remember the resulting open/closed state on the active tab group, so
        // switching groups later restores each one's own state (TabGroupSettingKey standard).
        setSidebarExtId((cur) => {
          const next = cur === id ? null : id;
          if (id === AGENT_EXTENSION_ID && activeGroupId !== null) {
            window.tepegoz.updateTabGroup(activeGroupId, {
              settings: { [AGENT_PANEL_OPEN_KEY]: next === id },
            });
          }
          return next;
        });
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
    [registry, activeGroupId],
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
    const unsubTabs = window.tepegoz.onTabsState(setTabs);
    const unsubRename = window.tepegoz.onTabGroupStartRename(setRenamingGroupId);
    return () => {
      unsubTabs();
      unsubRename();
    };
  }, []);

  // Transient toasts: append each pushed toast (capped to the newest 3; individual auto-dismiss timers
  // live in the ToastStack).
  useEffect(() => {
    return window.tepegoz.onNotificationToast((toast) => {
      setToasts((prev) => [...prev, toast].slice(-3));
    });
  }, []);

  // Per-site Web Notification consent prompts from the main-process broker. Only one at a time (the
  // broker serializes); a new one replaces any still-open prompt.
  useEffect(() => {
    return window.tepegoz.onNotificationPermissionRequest(setPermReq);
  }, []);

  // Autofill: main pushes matching credentials when a page finishes loading. Navigating away clears.
  useEffect(() => {
    return window.tepegoz.onAutofillAvailable((payload) => {
      setAutofill(payload);
    });
  }, []);

  // Refresh the credentials list whenever the Passwords settings section is open.
  const refreshLogins = useCallback(async (): Promise<void> => {
    try {
      setLoginCredentials(await window.tepegoz.listLogins());
    } catch {
      setLoginCredentials([]);
    }
  }, []);
  const answerPermission = useCallback(
    (allow: boolean, remember: boolean) => {
      if (permReq === null) return;
      window.tepegoz.respondNotificationPermission({ requestId: permReq.requestId, allow, remember });
      setPermReq(null);
    },
    [permReq],
  );

  // RTL-ready: mirror the active locale's writing direction onto <html dir> (both shipping locales are
  // LTR, so this is a no-op today, but the whole surface is wired for a future RTL locale — ADR-0016).
  useEffect(() => {
    document.documentElement.dir = localeDir(locale);
  }, [locale]);

  const theme = prefs?.theme ?? 'system';
  const themeColor = prefs?.themeColor ?? '';
  useEffect(() => {
    applyTheme(theme, themeColor);
    // Only follow OS changes for the plain system mode (a custom color overrides it).
    if (theme !== 'system' || themeColor !== '') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      applyTheme('system', '');
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, [theme, themeColor]);

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

  // Keep prefs fresh when ANOTHER window changes them (the Bookmarks menu toggling the bookmarks bar,
  // etc.) — main broadcasts on every prefs write. Refetch the full prefs so the bar re-renders live.
  useEffect(() => {
    return window.tepegoz.onPublicSettingsChanged(() => {
      void window.tepegoz.getPreferences().then(setPrefs, () => {
        /* bridge unavailable — keep the last known prefs */
      });
    });
  }, []);

  // Overlay surfaces (popup/modal/panel) are chrome-rendered and hide the active web view while open.
  // A sidebar resize also hides it momentarily so the chrome captures the drag's pointer stream (the
  // native web view otherwise swallows pointer events once the cursor crosses over it).
  useEffect(() => {
    const overlayOpen = activeSurface !== null || openAllUrls !== null;
    window.tepegoz.setContentVisible(!overlayOpen && !resizingSidebar);
  }, [activeSurface, openAllUrls, resizingSidebar]);

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

  // Right-click on a toolbar extension icon → the native menu relays the chosen action back here so it
  // runs against our authoritative React state: open its settings page, or remove (disable) it.
  useEffect(() => {
    return window.tepegoz.onExtensionContextMenuAction(({ id, action }) => {
      if (action === 'page') {
        setActiveSurface(null);
        window.tepegoz.navigateTab(extensionPageUrl(id));
      } else {
        onToggleExtension(id, false);
      }
    });
  }, [onToggleExtension]);

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
  const userMenuT = pick(userMenuDict, locale);

  // Shown while a lazily code-split extension surface loads (localized; a11y status role).
  const surfaceFallback = (
    <div
      role="status"
      aria-label={coreT.common.loading}
      className="flex h-full w-full items-center justify-center text-sm text-text-muted"
    >
      {coreT.common.loading}
    </div>
  );
  const activeTab = tabs.tabs.find((tb) => tb.id === tabs.activeId);
  const currentUrl = activeTab?.url ?? '';
  // Internal pages are tabs addressed tepegoz://… ; render them when active.
  const settingsActive = activeTab?.url === INTERNAL_SETTINGS_URL;
  const extensionsActive = activeTab?.url === INTERNAL_EXTENSIONS_URL;
  const historyActive = activeTab?.url === INTERNAL_HISTORY_URL;
  const bookmarksActive = activeTab?.url === INTERNAL_BOOKMARKS_URL;
  // An extension `page` surface: tepegoz://<extension-id> → render that extension's page component.
  const pageExtIds = registry.filter((d) => d.manifest.surfaces.includes('page')).map((d) => d.id);
  const pageExtId =
    activeTab !== undefined ? extensionIdFromPageUrl(activeTab.url, pageExtIds) : null;
  const PageSurface =
    pageExtId !== null ? extensionDefById(registry, pageExtId)?.surfaces.page : undefined;
  // The extension docked in the sidebar (if any) and its sidebar surface renderer.
  const sidebarDef = sidebarExtId !== null ? extensionDefById(registry, sidebarExtId) : undefined;
  const SidebarSurface = sidebarDef?.surfaces.sidebar;

  const extensionStates = prefs?.extensions ?? [];
  const enabledExtensions = registry.filter((ext) => isExtensionEnabled(extensionStates, ext.id));

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
  // The Bookmarks-bar root's children (tree) drive the interactive bar; the flat ref feeds the omnibox.
  const [barNodes, setBarNodes] = useState<BookmarkTreeNode[]>([]);
  // Bumped after any bookmark mutation → the manager page (tepegoz://bookmarks) refetches its own tree.
  const [bookmarksVersion, setBookmarksVersion] = useState(0);
  const canBookmark = isBookmarkable(currentUrl);

  const refreshBookmarks = useCallback(async (): Promise<void> => {
    let tree: BookmarkTreeNode[] = [];
    let flat: Awaited<ReturnType<typeof window.tepegoz.listBookmarks>> = [];
    try {
      [tree, flat] = await Promise.all([
        window.tepegoz.getBookmarkTree(),
        window.tepegoz.listBookmarks(),
      ]);
    } catch {
      tree = [];
      flat = [];
    }
    bookmarksRef.current = flat.map((b) => ({ url: b.url, title: b.title }));
    setBarNodes(tree.find((r) => r.id === BOOKMARK_ROOT_BAR)?.children ?? []);
    setBookmarksVersion((v) => v + 1);
  }, []);

  // Stable manager binding (it refetches when this or `refreshKey` change identity).
  const getBookmarkTree = useCallback(() => window.tepegoz.getBookmarkTree(), []);

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
    if (!isBookmarkable(url)) return;
    try {
      const nowBookmarked = await window.tepegoz.toggleBookmark(
        url,
        tab?.title ?? url,
        tab?.faviconUrl ?? null,
      );
      setActiveBookmarked(nowBookmarked);
      await refreshBookmarks();
    } catch (err) {
      console.error('Bookmark toggle failed', err); // star state stays as-is (nothing was persisted)
    }
  }, [refreshBookmarks]);

  // Bookmark bar drag-drop → move; native right-click menu → these renderer-driven actions. Rename and
  // add-folder open a small dialog; the rest run immediately, then refetch so the bar reflects the change.
  const onBookmarkMove = useCallback(
    (id: string, newParentId: string, index: number): void => {
      void (async () => {
        try {
          await window.tepegoz.moveBookmark(id, newParentId, index);
          await refreshBookmarks();
        } catch (err) {
          console.error('Bookmark move failed', err);
        }
      })();
    },
    [refreshBookmarks],
  );

  const findBarNode = useCallback(
    (id: string): BookmarkTreeNode | null => {
      const walk = (nodes: readonly BookmarkTreeNode[]): BookmarkTreeNode | null => {
        for (const n of nodes) {
          if (n.id === id) return n;
          const hit = walk(n.children);
          if (hit !== null) return hit;
        }
        return null;
      };
      return walk(barNodes);
    },
    [barNodes],
  );

  const onBookmarkMenuAction = useCallback(
    async (a: BookmarkMenuAction): Promise<void> => {
      const node = findBarNode(a.id);
      if (a.action === 'open') {
        if (node?.url != null) window.tepegoz.navigateTab(node.url);
      } else if (a.action === 'open-new-tab') {
        if (node?.url != null) window.tepegoz.createTabInBackground(node.url);
      } else if (a.action === 'open-all') {
        const urls: string[] = [];
        const collect = (n: BookmarkTreeNode): void => {
          if (n.type === 'bookmark' && n.url != null) urls.push(n.url);
          n.children.forEach(collect);
        };
        if (node !== null) collect(node);
        if (urls.length > 15) setOpenAllUrls(urls);
        else urls.forEach((u) => window.tepegoz.createTabInBackground(u));
      } else if (a.action === 'delete') {
        try {
          await window.tepegoz.removeBookmark(a.id); // the bookmarks:changed broadcast triggers the refetch
        } catch (err) {
          console.error('Bookmark delete failed', err);
        }
      } else if (a.action === 'open-manager') {
        window.tepegoz.navigateTab(INTERNAL_BOOKMARKS_URL);
      } else if (a.action === 'move-to-bar') {
        try {
          await window.tepegoz.moveBookmark(a.id, BOOKMARK_ROOT_BAR, 100000); // to the bar root's end
        } catch (err) {
          console.error('Move to bar failed', err);
        }
      } else if (a.action === 'rename') {
        window.tepegoz.openPopup('bookmark-rename', bookmarkDialogAnchor(), { id: a.id });
      } else {
        // add-folder: on a folder → subfolder inside it; on a bookmark → a sibling folder on the bar.
        const parentId = a.type === 'folder' ? a.id : BOOKMARK_ROOT_BAR;
        window.tepegoz.openPopup('bookmark-add-folder', bookmarkDialogAnchor(), { id: parentId });
      }
    },
    [findBarNode],
  );

  useEffect(() => {
    return window.tepegoz.onBookmarkMenuAction((a) => {
      void onBookmarkMenuAction(a);
    });
  }, [onBookmarkMenuAction]);

  // The tree changed (possibly from a popup window: folder dropdown, rename/add-folder dialog) → refetch.
  useEffect(() => {
    return window.tepegoz.onBookmarksChanged(() => {
      void refreshBookmarks();
    });
  }, [refreshBookmarks]);

  const onOmniboxSuggest = useCallback(async (query: string): Promise<OmniboxSuggestion[]> => {
    const { term } = parseOmniboxQuery(query);
    let history: Awaited<ReturnType<typeof window.tepegoz.searchHistory>> = [];
    try {
      history = term.length > 0 ? await window.tepegoz.searchHistory({ query: term }) : [];
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
    (q: string, offset: number) =>
      q.length === 0
        ? window.tepegoz.getHistory({ offset })
        : window.tepegoz.searchHistory({ query: q, offset }),
    [],
  );
  const historyRemove = useCallback((url: string) => window.tepegoz.deleteHistory(url), []);
  const historyClear = useCallback(() => window.tepegoz.clearHistory(), []);

  async function onUpdatePrefs(patch: Partial<Preferences>): Promise<void> {
    setPrefs(await window.tepegoz.updatePreferences(patch));
  }
  async function onAddKey(provider: ProviderId, label: string, apiKey: string): Promise<void> {
    setStatus(await window.tepegoz.addProviderKey(provider, label, apiKey));
  }
  async function onRemoveKeyById(id: string): Promise<void> {
    setStatus(await window.tepegoz.removeProviderKeyById(id));
  }
  async function onRenameKey(id: string, label: string): Promise<void> {
    setStatus(await window.tepegoz.renameProviderKey(id, label));
  }
  async function onReorderKeys(orderedIds: string[]): Promise<void> {
    setStatus(await window.tepegoz.reorderProviderKeys(orderedIds));
    // The top key defines the default provider; main synced it, so refresh prefs too.
    setPrefs(await window.tepegoz.getPreferences());
  }
  async function onResetPrefs(): Promise<void> {
    setPrefs(await window.tepegoz.resetPreferences());
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
    const def = extensionDefById(registry, activeSurface.id);
    const Surface = def?.surfaces[activeSurface.kind];
    if (def === undefined || Surface === undefined) return null;
    const body = (
      <Suspense fallback={surfaceFallback}>
        <Surface onClose={closeSurface} />
      </Suspense>
    );
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
          <Suspense fallback={surfaceFallback}>
            <SidebarSurface onClose={() => setSidebarExtId(null)} />
          </Suspense>
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
          tabGroups={tabs.groups}
          renamingGroupId={renamingGroupId}
          activeTabId={tabs.activeId}
          onSelectTab={(id) => {
            setActiveSurface(null); // close any extension surface when switching tabs
            window.tepegoz.activateTab(id);
          }}
          onCloseTab={(id) => window.tepegoz.closeTab(id)}
          onTabContextMenu={(id) => window.tepegoz.showTabContextMenu(id)}
          onTabGroupContextMenu={(groupId) => window.tepegoz.showTabGroupContextMenu(groupId)}
          onRenameTabGroupHandled={() => setRenamingGroupId(null)}
          onNewTab={() => {
            setActiveSurface(null);
            window.tepegoz.createTab();
          }}
          onMoveTab={(id, toIndex) => window.tepegoz.moveTab(id, toIndex)}
          onMoveTabGroup={(groupId, toIndex) => window.tepegoz.moveTabGroup(groupId, toIndex)}
          onAssignTabToGroup={(tabId, groupId) => window.tepegoz.assignTabToGroup(tabId, groupId)}
          onToggleGroupCollapsed={(groupId, collapsed) =>
            window.tepegoz.updateTabGroup(groupId, { collapsed })
          }
          onRenameTabGroup={(groupId, name) => window.tepegoz.updateTabGroup(groupId, { name })}
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
          onHome={() => window.tepegoz.tabHome()}
          captionLeading={<NotificationBellButton />}
          menu={<MainMenuButton label={browserT.menu} />}
          onNavigate={(input) => window.tepegoz.navigateTab(input)}
          onSuggest={onOmniboxSuggest}
          onActivateTab={onActivateTabFromOmnibox}
          isBookmarked={activeBookmarked}
          canBookmark={canBookmark}
          onToggleBookmark={() => void onToggleBookmark()}
          toolbarActions={
            <>
              <ExtensionTray
                locale={locale}
                extensions={enabledExtensions}
                activeExtensionId={activeSurface?.id ?? sidebarExtId ?? popupOpenId ?? null}
                onExtensionAction={runExtensionAction}
              />
              <UserMenuButton label={userMenuT.menuLabel} name={userMenuT.name} />
            </>
          }
        />
        {/* Chrome-style bookmarks bar (toggled from the Bookmarks menu). Rendered above the content row,
            so contentRef's ResizeObserver reports the new top and main reflows the web view down.
            Default-on: shown once prefs load unless explicitly turned off. */}
        {prefs !== null && prefs.showBookmarksBar !== false && (
          <BookmarksBar
            nodes={barNodes}
            barRootId={BOOKMARK_ROOT_BAR}
            onOpen={(url) => window.tepegoz.navigateTab(url)}
            onOpenFolder={(folderId, anchor) => {
              // Seed a tight height (main self-resizes to the real content once it loads) so a small
              // folder doesn't open as a tall window.
              const rows = Math.max(1, findBarNode(folderId)?.children.length ?? 1);
              window.tepegoz.openPopup('bookmark-folder', anchor, { id: folderId, height: rows * 32 + 12 });
            }}
            onMove={onBookmarkMove}
            onContextMenu={(id, type) => window.tepegoz.showBookmarkContextMenu(id, type)}
            labels={{ bar: browserT.bookmarksBar, empty: browserT.noBookmarksBar }}
          />
        )}
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
              <div className="absolute inset-0 bg-surface-system">
                {prefs && status ? (
                  <SettingsPage
                    prefs={prefs}
                    status={status}
                    onUpdatePrefs={onUpdatePrefs}
                    onResetPrefs={onResetPrefs}
                    onAddKey={onAddKey}
                    onRemoveKeyById={onRemoveKeyById}
                    onRenameKey={onRenameKey}
                    onReorderKeys={onReorderKeys}
                    getMcpStatus={() => window.tepegoz.getMcpStatus()}
                    loginCredentials={loginCredentials}
                    onLoginSectionMount={refreshLogins}
                    onAddLogin={(c) =>
                      window.tepegoz.setLogin(c).then(async () => { await refreshLogins(); })
                    }
                    onRemoveLogin={(id) =>
                      window.tepegoz.removeLogin(id).then(async () => { await refreshLogins(); })
                    }
                    onImportLogins={(data, fmt) =>
                      window.tepegoz.importLogins(data, fmt).then(async (r) => {
                        await refreshLogins();
                        return r;
                      })
                    }
                    onExportLogins={(fmt) => window.tepegoz.exportLogins(fmt)}
                  />
                ) : (
                  <p className="px-6 py-8 text-sm text-text-secondary">…</p>
                )}
              </div>
            )}
            {extensionsActive && (
              <div className="absolute inset-0 bg-surface-system">
                <ExtensionsPage
                  locale={locale}
                  extensions={registry}
                  states={extensionStates}
                  onToggle={onToggleExtension}
                />
              </div>
            )}
            {historyActive && (
              <div className="absolute inset-0 bg-surface-system">
                <HistoryPage list={historyList} remove={historyRemove} clear={historyClear} />
              </div>
            )}
            {bookmarksActive && (
              <div className="absolute inset-0 bg-surface-system">
                <BookmarksManager
                  getTree={getBookmarkTree}
                  refreshKey={bookmarksVersion}
                  onMove={onBookmarkMove}
                  onNewFolder={(parentId) =>
                    window.tepegoz.openPopup('bookmark-add-folder', bookmarkDialogAnchor(), { id: parentId })
                  }
                  onOpen={(url) => window.tepegoz.navigateTab(url)}
                  onContextMenu={(id, type) => window.tepegoz.showBookmarkContextMenu(id, type)}
                />
              </div>
            )}
            {PageSurface !== undefined && (
              <div className="absolute inset-0 bg-surface-base">
                <Suspense fallback={surfaceFallback}>
                  <PageSurface onClose={closeSurface} />
                </Suspense>
              </div>
            )}
            {renderActiveSurface()}
            {autofill !== null && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                <div className="pointer-events-auto">
                  <AutofillSuggestion
                    url={autofill.url}
                    matches={autofill.matches}
                    onFill={(id) => {
                      window.tepegoz.fillLogin(id);
                      setAutofill(null);
                    }}
                    onDismiss={() => setAutofill(null)}
                  />
                </div>
              </div>
            )}
          </div>
          {renderSidebar()}
        </div>
        {/* Transient toast overlay (channel `toast`); native OS notifications cover the over-page case. */}
        <ToastStack
          toasts={toasts}
          onDismiss={dismissToast}
          onAction={(item, action) => {
            runNotificationAction(item, action);
            dismissToast(item.id);
          }}
        />
        {/* Per-site Web Notification consent prompt (blocking: no backdrop dismiss — the site awaits an answer). */}
        <Modal
          open={permReq !== null}
          onClose={() => answerPermission(false, false)}
          ariaLabel={permReq?.origin ?? ''}
          closeOnBackdrop={false}
        >
          {permReq !== null && (
            <NotificationPermissionPrompt origin={permReq.origin} onDecision={answerPermission} />
          )}
        </Modal>
        {/* "Open all" confirmation for a large folder. */}
        <Modal
          open={openAllUrls !== null}
          onClose={() => setOpenAllUrls(null)}
          ariaLabel={browserT.bookmarkMenu.openAll}
        >
          {openAllUrls !== null && (
            <div className="flex min-w-[20rem] flex-col gap-4 p-4">
              <p className="text-sm text-text-primary">
                {browserT.openAllConfirm} ({openAllUrls.length})
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpenAllUrls(null)}
                  className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay"
                >
                  {browserT.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openAllUrls.forEach((u) => window.tepegoz.createTabInBackground(u));
                    setOpenAllUrls(null);
                  }}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                >
                  {browserT.bookmarkMenu.openAll}
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
      <CursorOverlay />
    </I18nProvider>
  );
}
