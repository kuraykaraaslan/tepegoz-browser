import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { resources, resolveLocale, type Locale } from '@tepegoz/i18n';
import { Modal } from '@tepegoz/ui';
import {
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_SETTINGS_URL,
  isExtensionEnabled,
} from '../../shared/ipc-contract';
import type {
  CredentialsStatus,
  ExtensionId,
  LocalePref,
  Preferences,
  ProviderId,
  TabsState,
  ThemePref,
} from '../../shared/ipc-contract';
import { extensionIdFromPageUrl, extensionLabel, extensionPageUrl } from '../../shared/extensions';
import { EXTENSIONS, extensionDefById } from './extensions/registry';
import { HistoryPage } from '@tepegoz/history-ui';
import { ExtensionsPage } from './components/ExtensionsPage';
import { SettingsPage } from './components/SettingsPage';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';

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
  const contentRef = useRef<HTMLDivElement | null>(null);

  const locale = effectiveLocale(prefs?.locale ?? 'system');

  const closeSurface = useCallback(() => {
    setActiveSurface(null);
  }, []);

  // Resolve a toolbar icon click/double-click (or a menu request) to its bound surface.
  const runExtensionAction = useCallback((id: string, trigger: 'click' | 'doubleClick') => {
    const def = extensionDefById(id);
    if (def === undefined) return;
    const action = trigger === 'click' ? def.manifest.actions.click : def.manifest.actions.doubleClick;
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
    // Overlay surfaces (popup/modal/panel) hide the web view. Toggle: re-triggering closes it.
    setActiveSurface((cur) =>
      cur !== null && cur.id === id && cur.kind === action ? null : { id, kind: action },
    );
  }, []);

  // Drag the sidebar's inner edge to resize (clamped). While dragging we hide the web view so the
  // chrome — not the native view beside it — receives the pointer stream across the whole content area.
  function onSidebarResizeStart(e: ReactPointerEvent): void {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    setResizingSidebar(true);
    const onMove = (ev: PointerEvent): void => {
      const next = startWidth + (startX - ev.clientX); // drag left → wider
      setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next)));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizingSidebar(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
      } catch {
        // Preload bridge unavailable (dev mishap) — leave defaults; the chrome still renders.
      }
    })();
    return window.tepegoz.onTabsState(setTabs);
  }, []);

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

  // App shortcuts (single registry): the accelerators shown in the main menu are wired here. We
  // preventDefault so Ctrl+R reloads the active TAB, not the app chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 't') {
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

  const t = resources[locale];
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
    void onUpdatePrefs({ extensions: next });
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
    const body = <Surface t={t} onClose={closeSurface} />;
    if (activeSurface.kind === 'panel') return body;
    if (activeSurface.kind === 'modal') {
      return (
        <Modal open onClose={closeSurface} ariaLabel={extensionLabel(def.manifest, locale).name}>
          {body}
        </Modal>
      );
    }
    // popup — a floating card anchored top-right over a dim backdrop that closes on outside click. The
    // host clamps its width/height (with scroll) so an extension can't open an oversized popup.
    return (
      <div className="absolute inset-0 z-10 bg-black/40" role="presentation" onClick={closeSurface}>
        <div
          className="absolute right-2 top-2"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <div className="max-h-[70vh] w-[min(360px,calc(100vw-1rem))] overflow-auto rounded-lg border border-border bg-surface-raised shadow-xl">
            {body}
          </div>
        </div>
      </div>
    );
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
          aria-label={t.sidebar.resize}
          onPointerDown={onSidebarResizeStart}
          className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-border-focus"
        />
        <div className="relative flex-1 overflow-hidden">
          <SidebarSurface t={t} onClose={() => setSidebarExtId(null)} />
        </div>
      </aside>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-surface-base text-text-primary">
      <TitleBar
        t={t}
        tabs={tabs.tabs}
        activeId={tabs.activeId}
        onSelectTab={(id) => {
          setActiveSurface(null); // close any extension surface when switching tabs
          window.tepegoz.activateTab(id);
        }}
        onNewTab={() => {
          setActiveSurface(null);
          window.tepegoz.createTab();
        }}
      />
      <Toolbar
        t={t}
        locale={locale}
        currentUrl={currentUrl}
        canGoBack={tabs.canGoBack}
        canGoForward={tabs.canGoForward}
        extensions={enabledExtensions}
        activeExtensionId={activeSurface?.id ?? sidebarExtId ?? null}
        onExtensionAction={runExtensionAction}
      />
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left region = the web-view area (its bounds are measured from contentRef, so they exclude
            the sidebar); the resizable sidebar dock sits to its right. */}
        <div ref={contentRef} className="relative flex-1 overflow-hidden">
        {/* The active tab's web page is a separate WebContentsView laid over this area by main. The
            internal app tabs (Settings/Extensions/History), extension `page` tabs, and open overlay
            surfaces have no web view, so the chrome renders them here instead. */}
        {settingsActive && (
          <div className="absolute inset-0 bg-surface-base">
            {prefs && status ? (
              <SettingsPage
                t={t}
                prefs={prefs}
                status={status}
                onUpdatePrefs={onUpdatePrefs}
                onSetKey={onSetKey}
                onRemoveKey={onRemoveKey}
              />
            ) : (
              <p className="px-6 py-8 text-sm text-text-secondary">…</p>
            )}
          </div>
        )}
        {extensionsActive && (
          <div className="absolute inset-0 bg-surface-base">
            <ExtensionsPage t={t} locale={locale} states={extensionStates} onToggle={onToggleExtension} />
          </div>
        )}
        {historyActive && (
          <div className="absolute inset-0 bg-surface-base">
            <HistoryPage
              labels={{
                title: t.history.title,
                search: t.history.search,
                clear: t.history.clear,
                delete: t.history.delete,
                empty: t.history.empty,
              }}
              list={(q) => (q.length === 0 ? window.tepegoz.getHistory() : window.tepegoz.searchHistory(q))}
              remove={(url) => window.tepegoz.deleteHistory(url)}
              clear={() => window.tepegoz.clearHistory()}
            />
          </div>
        )}
        {PageSurface !== undefined && (
          <div className="absolute inset-0 bg-surface-base">
            <PageSurface t={t} onClose={closeSurface} />
          </div>
        )}
        {renderActiveSurface()}
        </div>
        {renderSidebar()}
      </div>
    </div>
  );
}
