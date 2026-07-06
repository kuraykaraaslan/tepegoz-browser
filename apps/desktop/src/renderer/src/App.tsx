import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { coreDict, localeDir, pick, resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider } from '@tepegoz/i18n/react';
import { Modal } from '@tepegoz/ui';
import { browserDict, sidebarDict, userMenuDict } from '../../i18n';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_SETTINGS_URL,
  INTERNAL_TASKS_URL,
  INTERNAL_UPLOADS_URL,
  isExtensionEnabled,
} from '@tepegoz/desktop-ipc';
import type {
  AppNotification,
  AutofillAvailablePayload,
  CredentialsStatus,
  ExtensionId,
  LocalePref,
  LoginCredentialMeta,
  NotificationPermissionRequest,
  Preferences,
  ProviderId,
  TabsState,
} from '@tepegoz/desktop-ipc';
import { NotificationPermissionPrompt, ToastStack } from '@tepegoz/notifications-ui';
import { AutofillSuggestion } from '@tepegoz/password-ui';
import { BOOKMARK_ROOT_BAR } from '@tepegoz/bookmarks';
import { runNotificationAction } from './lib/notification-actions';
import { extensionIdFromPageUrl, extensionPageUrl } from '../../shared/extension-urls';
import { extensionDefById } from './extensions/registry';
import { useExtensionCatalog } from './extensions/useExtensionCatalog';
import { BrowserChrome } from '@tepegoz/browser-chrome';
import { BookmarksBar } from '@tepegoz/bookmarks-bar';
import { HistoryPage } from '@tepegoz/history-ui';
import { DownloadsPage } from '@tepegoz/downloads-ui';
import { UploadsPage } from '@tepegoz/uploads-ui';
import { TasksPage } from '@tepegoz/tasks-ui';
import { BookmarksManager } from '@tepegoz/bookmarks-ui';
import { ExtensionsPage } from './components/ExtensionsPage';
import { ExtensionTray } from './components/ExtensionTray';
import { MainMenuButton } from './components/MainMenuButton';
import { TransferActivityButton } from './components/TransferActivityButton';
import { UserMenuButton } from './components/UserMenuButton';
import { NotificationBellButton } from './components/NotificationBellButton';
import { SettingsPage } from './components/SettingsPage';
import { CursorOverlay } from './components/CursorOverlay';
import { applyTheme } from './lib/theme';
import { useWindowMaximized } from './lib/useWindowMaximized';
import { bookmarkDialogAnchor, useBookmarksBar } from './app-bookmarks';
import { AGENT_PANEL_OPEN_KEY, useExtensionSurfaces } from './app-extension-surfaces';
import { useOmniboxAndHistory } from './app-omnibox-history';

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

export function App() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [tabs, setTabs] = useState<TabsState>(EMPTY_TABS);
  // A group whose inline rename editor should open (set by the native group menu's "Rename" push).
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  // Transient toasts pushed from NotificationHost (channel `toast`); capped, oldest dropped.
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);
  // Pending per-site Web Notification consent prompt (from the main-process broker), or null.
  const [permReq, setPermReq] = useState<NotificationPermissionRequest | null>(null);
  // Autofill suggestions pushed from main when a page loads and has matching stored credentials.
  const [autofill, setAutofill] = useState<AutofillAvailablePayload | null>(null);
  // Cached credential list for the Passwords settings section.
  const [loginCredentials, setLoginCredentials] = useState<LoginCredentialMeta[]>([]);
  // Built-in extensions, fetched once over IPC (identity) + paired with lazy surfaces. Empty until it
  // resolves — the tray/menus tolerate an empty list the same way the UI tolerates `prefs === null`.
  const { registry } = useExtensionCatalog();

  const locale = effectiveLocale(prefs?.locale ?? 'system');

  // Shared ref for handlers that need the latest tab state without re-subscribing every render
  // (bookmarks + omnibox, both split into their own hooks below).
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const activeTab = tabs.tabs.find((tb) => tb.id === tabs.activeId);
  const currentUrl = activeTab?.url ?? '';

  const bookmarks = useBookmarksBar(tabsRef, currentUrl);

  // The active tab's group (null when ungrouped) + that group's remembered Agent Console open state.
  const activeGroupId = tabs.tabs.find((t) => t.id === tabs.activeId)?.groupId ?? null;
  const activeGroupAgentPanelOpen = tabs.groups.find((g) => g.id === activeGroupId)?.settings[
    AGENT_PANEL_OPEN_KEY
  ];

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

  const extSurfaces = useExtensionSurfaces(
    registry,
    activeGroupId,
    activeGroupAgentPanelOpen,
    locale,
    sidebarT.resize,
    surfaceFallback,
    bookmarks.openAllUrls !== null,
  );

  const omniboxHistory = useOmniboxAndHistory(
    tabsRef,
    {
      search: browserT.omniboxSearchHint,
      switchToTab: browserT.omniboxSwitchToTab,
      bookmark: browserT.omniboxBookmark,
    },
    bookmarks.bookmarksRef,
    extSurfaces.closeSurface,
  );

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
  const contentRef = useRef<HTMLDivElement | null>(null);
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

  // Right-click on a toolbar extension icon → the native menu relays the chosen action back here so it
  // runs against our authoritative React state: open its settings page, or remove (disable) it.
  useEffect(() => {
    return window.tepegoz.onExtensionContextMenuAction(({ id, action }) => {
      if (action === 'page') {
        extSurfaces.closeSurface();
        window.tepegoz.navigateTab(extensionPageUrl(id));
      } else {
        onToggleExtension(id, false);
      }
    });
  }, [onToggleExtension]);

  // App shortcuts (single registry): the accelerators shown in the main menu are wired here. We
  // preventDefault so Ctrl+R reloads the active TAB, not the app chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 't' && e.shiftKey) {
        e.preventDefault();
        extSurfaces.closeSurface();
        window.tepegoz.reopenClosedTab(); // Ctrl+Shift+T — reopen the last-closed tab
      } else if (key === 't') {
        e.preventDefault();
        extSurfaces.closeSurface();
        window.tepegoz.createTab();
      } else if (key === 'r') {
        e.preventDefault();
        window.tepegoz.tabReload();
      } else if (key === ',') {
        e.preventDefault();
        extSurfaces.closeSurface();
        window.tepegoz.navigateTab(INTERNAL_SETTINGS_URL); // opens/focuses the Settings tab
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const isMaximized = useWindowMaximized();
  // Internal pages are tabs addressed tepegoz://… ; render them when active.
  const settingsActive = currentUrl === INTERNAL_SETTINGS_URL;
  const extensionsActive = currentUrl === INTERNAL_EXTENSIONS_URL;
  const historyActive = currentUrl === INTERNAL_HISTORY_URL;
  const downloadsActive = currentUrl === INTERNAL_DOWNLOADS_URL;
  const uploadsActive = currentUrl === INTERNAL_UPLOADS_URL;
  const tasksActive = currentUrl === INTERNAL_TASKS_URL;
  const bookmarksActive = currentUrl === INTERNAL_BOOKMARKS_URL;
  // An extension `page` surface: tepegoz://<extension-id> → render that extension's page component.
  const pageExtIds = registry.filter((d) => d.manifest.surfaces.includes('page')).map((d) => d.id);
  const pageExtId =
    activeTab !== undefined ? extensionIdFromPageUrl(activeTab.url, pageExtIds) : null;
  const PageSurface =
    pageExtId !== null ? extensionDefById(registry, pageExtId)?.surfaces.page : undefined;

  const extensionStates = prefs?.extensions ?? [];
  const enabledExtensions = registry.filter((ext) => isExtensionEnabled(extensionStates, ext.id));

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
    if (!enabled && extSurfaces.activeSurface?.id === id) extSurfaces.closeSurface();
    if (!enabled && extSurfaces.sidebarExtId === id) extSurfaces.closeSidebar();
  }

  const downloadList = useCallback(() => window.tepegoz.listDownloads(), []);
  const downloadCommand = useCallback(
    (input: Parameters<typeof window.tepegoz.commandDownload>[0]) =>
      window.tepegoz.commandDownload(input),
    [],
  );
  const downloadSubscribe = useCallback(
    (callback: Parameters<typeof window.tepegoz.onDownloadsState>[0]) =>
      window.tepegoz.onDownloadsState(callback),
    [],
  );
  const uploadList = useCallback(() => window.tepegoz.listUploads(), []);
  const uploadCommand = useCallback(
    (input: Parameters<typeof window.tepegoz.commandUpload>[0]) =>
      window.tepegoz.commandUpload(input),
    [],
  );
  const uploadSubscribe = useCallback(
    (callback: Parameters<typeof window.tepegoz.onUploadsState>[0]) =>
      window.tepegoz.onUploadsState(callback),
    [],
  );
  const taskList = useCallback(() => window.tepegoz.listTasks(), []);
  const taskSave = useCallback(
    (input: Parameters<typeof window.tepegoz.saveTask>[0]) => window.tepegoz.saveTask(input),
    [],
  );
  const taskCommand = useCallback(
    (input: Parameters<typeof window.tepegoz.runTaskNow>[0]) =>
      input.action === 'cancel'
        ? window.tepegoz.cancelTaskRun(input)
        : window.tepegoz.runTaskNow(input),
    [],
  );
  const taskSetEnabled = useCallback(
    (input: Parameters<typeof window.tepegoz.setTaskEnabled>[0]) =>
      window.tepegoz.setTaskEnabled(input),
    [],
  );
  const taskRuns = useCallback((taskId?: string) => window.tepegoz.listTaskRuns(taskId), []);
  const taskArtifacts = useCallback(
    (taskId?: string) => window.tepegoz.listTaskArtifacts(taskId),
    [],
  );
  const taskSubscribe = useCallback(
    (callback: Parameters<typeof window.tepegoz.onTasksState>[0]) =>
      window.tepegoz.onTasksState(callback),
    [],
  );

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
            extSurfaces.closeSurface(); // close any extension surface when switching tabs
            window.tepegoz.activateTab(id);
          }}
          onCloseTab={(id) => window.tepegoz.closeTab(id)}
          onTabContextMenu={(id) => window.tepegoz.showTabContextMenu(id)}
          onTabGroupContextMenu={(groupId) => window.tepegoz.showTabGroupContextMenu(groupId)}
          onRenameTabGroupHandled={() => setRenamingGroupId(null)}
          onNewTab={() => {
            extSurfaces.closeSurface();
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
          onSuggest={omniboxHistory.onOmniboxSuggest}
          onActivateTab={omniboxHistory.onActivateTabFromOmnibox}
          isBookmarked={bookmarks.activeBookmarked}
          canBookmark={bookmarks.canBookmark}
          onToggleBookmark={() => void bookmarks.onToggleBookmark()}
          toolbarActions={
            <>
              <TransferActivityButton />
              <ExtensionTray
                locale={locale}
                extensions={enabledExtensions}
                activeExtensionId={
                  extSurfaces.activeSurface?.id ?? extSurfaces.sidebarExtId ?? extSurfaces.popupOpenId ?? null
                }
                onExtensionAction={extSurfaces.runExtensionAction}
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
            nodes={bookmarks.barNodes}
            barRootId={BOOKMARK_ROOT_BAR}
            onOpen={(url) => window.tepegoz.navigateTab(url)}
            onOpenFolder={(folderId, anchor) => {
              // Seed a tight height (main self-resizes to the real content once it loads) so a small
              // folder doesn't open as a tall window.
              const rows = Math.max(1, bookmarks.findBarNode(folderId)?.children.length ?? 1);
              window.tepegoz.openPopup('bookmark-folder', anchor, { id: folderId, height: rows * 32 + 12 });
            }}
            onMove={bookmarks.onBookmarkMove}
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
            {extSurfaces.resizeSnapshot !== null && (
              // A still of the page shown while the live web view is hidden during a sidebar resize drag.
              <img
                src={extSurfaces.resizeSnapshot}
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
                <HistoryPage
                  list={omniboxHistory.historyList}
                  remove={omniboxHistory.historyRemove}
                  clear={omniboxHistory.historyClear}
                />
              </div>
            )}
            {downloadsActive && (
              <div className="absolute inset-0 bg-surface-system">
                <DownloadsPage
                  list={downloadList}
                  command={downloadCommand}
                  subscribe={downloadSubscribe}
                />
              </div>
            )}
            {uploadsActive && (
              <div className="absolute inset-0 bg-surface-system">
                <UploadsPage
                  list={uploadList}
                  command={uploadCommand}
                  subscribe={uploadSubscribe}
                />
              </div>
            )}
            {tasksActive && (
              <div className="absolute inset-0 bg-surface-system">
                <TasksPage
                  list={taskList}
                  save={taskSave}
                  command={taskCommand}
                  setEnabled={taskSetEnabled}
                  listRuns={taskRuns}
                  listArtifacts={taskArtifacts}
                  subscribe={taskSubscribe}
                />
              </div>
            )}
            {bookmarksActive && (
              <div className="absolute inset-0 bg-surface-system">
                <BookmarksManager
                  getTree={bookmarks.getBookmarkTree}
                  refreshKey={bookmarks.bookmarksVersion}
                  onMove={bookmarks.onBookmarkMove}
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
                  <PageSurface onClose={extSurfaces.closeSurface} />
                </Suspense>
              </div>
            )}
            {extSurfaces.renderActiveSurface()}
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
          {extSurfaces.renderSidebar()}
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
            <NotificationPermissionPrompt
              origin={permReq.origin}
              capability={permReq.capability}
              onDecision={answerPermission}
            />
          )}
        </Modal>
        {/* "Open all" confirmation for a large folder. */}
        <Modal
          open={bookmarks.openAllUrls !== null}
          onClose={() => bookmarks.setOpenAllUrls(null)}
          ariaLabel={browserT.bookmarkMenu.openAll}
        >
          {bookmarks.openAllUrls !== null && (
            <div className="flex min-w-[20rem] flex-col gap-4 p-4">
              <p className="text-sm text-text-primary">
                {browserT.openAllConfirm} ({bookmarks.openAllUrls.length})
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => bookmarks.setOpenAllUrls(null)}
                  className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay"
                >
                  {browserT.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    bookmarks.openAllUrls?.forEach((u) => window.tepegoz.createTabInBackground(u));
                    bookmarks.setOpenAllUrls(null);
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
