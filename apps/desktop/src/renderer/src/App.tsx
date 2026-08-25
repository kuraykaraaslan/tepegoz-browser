import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandPaletteHost, useCommandPalette } from './command-palette-host';
import { coreDict, pick } from '@tepegoz/i18n';
import { I18nProvider } from '@tepegoz/i18n/react';
import { isExtensionEnabled } from '@tepegoz/desktop-ipc';
import type {
  AppNotification,
  AutofillAvailablePayload,
  CredentialsStatus,
  ExtensionId,
  LoginCredentialMeta,
  NotificationPermissionRequest,
  Preferences,
  ProviderId,
  TabsState,
} from '@tepegoz/desktop-ipc';
import { INTERNAL_SETTINGS_URL } from '@tepegoz/desktop-ipc';
import { browserDict, sidebarDict } from '../../i18n';
import { useExtensionCatalog } from './extensions/useExtensionCatalog';
import { CursorOverlay } from './components/CursorOverlay';
import { useWindowMaximized } from './lib/useWindowMaximized';
import { useBookmarksBar } from './app-bookmarks';
import { AGENT_PANEL_OPEN_KEY, useExtensionSurfaces } from './app-extension-surfaces';
import { useOmniboxAndHistory } from './app-omnibox-history';
import { effectiveLocale, EMPTY_TABS, QUICK_SETTING_SECTION } from './App-helpers';
import { useAppEffects } from './App-effects';
import { AppChrome } from './App-chrome';
import { AppContent } from './App-content';
import { AppOverlays } from './App-overlays';
import type { OmniboxQuickSettingTarget } from '@tepegoz/omnibox';
import { useReader } from './app-reader';

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
  // Whether the OS can render the glass (Win11 Mica) chrome — gates both the `.glass` class and the
  // Settings toggle. Fetched once from app info.
  const [glassAvailable, setGlassAvailable] = useState(false);
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
  const [omniboxDropdownHeight, setOmniboxDropdownHeight] = useState(0);
  const [omniboxSnapshot, setOmniboxSnapshot] = useState<string | null>(null);
  const [omniboxViewHidden, setOmniboxViewHidden] = useState(false);
  const omniboxDropdownOpen = omniboxDropdownHeight > 0;
  const onOmniboxDropdownHeightChange = useCallback((height: number): void => {
    const next = Math.max(0, Math.ceil(height));
    setOmniboxDropdownHeight((current) => (current === next ? current : next));
  }, []);

  const bookmarks = useBookmarksBar(tabsRef, currentUrl);
  const readerState = useReader(tabs.activeId, currentUrl);
  useEffect(
    () => window.tepegoz.onReaderToggle(readerState.toggleReader),
    [readerState.toggleReader],
  );

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
    bookmarks.openAllUrls !== null || omniboxViewHidden,
  );

  const omniboxHistory = useOmniboxAndHistory(
    tabsRef,
    {
      search: browserT.omniboxSearchHint,
      switchToTab: browserT.omniboxSwitchToTab,
      bookmark: browserT.omniboxBookmark,
      quickSettings: browserT.omniboxQuickSettings,
      quickAppearance: browserT.omniboxQuickAppearance,
      quickLanguage: browserT.omniboxQuickLanguage,
      quickPrivacy: browserT.omniboxQuickPrivacy,
      command: browserT.omniboxCommand,
      agentAsk: browserT.omniboxAgentAsk,
      agentHint: browserT.omniboxAgentHint,
      agentEmpty: browserT.omniboxAgentEmpty,
      commandAgent: browserT.omniboxCommandAgent,
      commandDownload: browserT.omniboxCommandDownload,
      commandSkill: browserT.omniboxCommandSkill,
      download: browserT.omniboxDownload,
      skill: browserT.omniboxSkill,
      commandNoResults: browserT.omniboxCommandNoResults,
    },
    bookmarks.bookmarksRef,
    extSurfaces.closeSurface,
  );

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
      window.tepegoz.respondNotificationPermission({
        requestId: permReq.requestId,
        allow,
        remember,
      });
      setPermReq(null);
    },
    [permReq],
  );

  // Tell main where to lay out the active tab's web view (the content area below the chrome).
  const contentRef = useRef<HTMLDivElement | null>(null);

  const isMaximized = useWindowMaximized();

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
  async function onSetKeyModel(id: string, model: string): Promise<void> {
    setStatus(await window.tepegoz.setProviderKeyModel(id, model));
  }
  async function onReorderKeys(orderedIds: string[]): Promise<void> {
    setStatus(await window.tepegoz.reorderProviderKeys(orderedIds));
    // The top key defines the default provider; main synced it, so refresh prefs too.
    setPrefs(await window.tepegoz.getPreferences());
  }
  async function onResetPrefs(): Promise<void> {
    setPrefs(await window.tepegoz.resetPreferences());
  }
  function onOpenQuickSetting(target: OmniboxQuickSettingTarget): void {
    extSurfaces.closeSurface();
    window.tepegoz.navigateTab(`${INTERNAL_SETTINGS_URL}#${QUICK_SETTING_SECTION[target]}`);
  }
  // Chrome-style toolbar pinning. The pinned array's ORDER is the icon order, so a drag-reorder and a
  // pin/unpin are both just a rewrite of `prefs.pinnedExtensions`.
  function onReorderPinned(ids: ExtensionId[]): void {
    onUpdatePrefs({ pinnedExtensions: ids }).catch((err: unknown) => {
      console.error('Pinned extension reorder failed', err); // prefs unchanged in main → UI consistent
    });
  }
  function onUnpinExtension(id: ExtensionId): void {
    const pinned = prefs?.pinnedExtensions ?? [];
    if (pinned.includes(id)) onReorderPinned(pinned.filter((p) => p !== id));
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

  useAppEffects({
    prefs,
    locale,
    glassAvailable,
    omniboxDropdownOpen,
    contentRef,
    extSurfaces,
    onToggleExtension,
    onUnpinExtension,
    setPrefs,
    setStatus,
    setTabs,
    setRenamingGroupId,
    setToasts,
    setPermReq,
    setAutofill,
    setGlassAvailable,
    setOmniboxViewHidden,
    setOmniboxSnapshot,
  });

  const contentSnapshot =
    extSurfaces.resizeSnapshot ?? (omniboxViewHidden ? omniboxSnapshot : null);

  // Ctrl/Cmd+K. Declared before the kiosk early-return so the hook order never changes between renders.
  const palette = useCommandPalette();

  // Chromeless kiosk surface (startupMode: 'kiosk' → loaded with ?kiosk=1): no tab strip / toolbar /
  // overlays — the kiosk URL's web view (laid out by main over `contentRef`) fills the whole screen. The
  // hooks above still run, so content bounds + tab state stay wired.
  if (new URLSearchParams(window.location.search).get('kiosk') === '1') {
    return (
      <I18nProvider locale={locale}>
        <div ref={contentRef} className="h-screen w-screen bg-surface-base" />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider locale={locale}>
      <div className="app-shell flex h-screen flex-col bg-surface-base text-text-primary">
        <AppChrome
          locale={locale}
          prefs={prefs}
          tabs={tabs}
          currentUrl={currentUrl}
          renamingGroupId={renamingGroupId}
          setRenamingGroupId={setRenamingGroupId}
          isMaximized={isMaximized}
          enabledExtensions={enabledExtensions}
          onReorderPinned={onReorderPinned}
          extSurfaces={extSurfaces}
          omniboxHistory={omniboxHistory}
          bookmarks={bookmarks}
          onOpenQuickSetting={onOpenQuickSetting}
          onOmniboxDropdownHeightChange={onOmniboxDropdownHeightChange}
        />
        <AppContent
          contentRef={contentRef}
          contentSnapshot={contentSnapshot}
          tabs={tabs}
          currentUrl={currentUrl}
          registry={registry}
          prefs={prefs}
          status={status}
          locale={locale}
          surfaceFallback={surfaceFallback}
          extSurfaces={extSurfaces}
          omniboxHistory={omniboxHistory}
          bookmarks={bookmarks}
          autofill={autofill}
          setAutofill={setAutofill}
          loginCredentials={loginCredentials}
          refreshLogins={refreshLogins}
          onUpdatePrefs={onUpdatePrefs}
          reader={readerState}
          onResetPrefs={onResetPrefs}
          onAddKey={onAddKey}
          onRemoveKeyById={onRemoveKeyById}
          onRenameKey={onRenameKey}
          onSetKeyModel={onSetKeyModel}
          onReorderKeys={onReorderKeys}
          onToggleExtension={onToggleExtension}
        />
        <CommandPaletteHost
          open={palette.open}
          onClose={() => {
            palette.setOpen(false);
          }}
        />
        <AppOverlays
          locale={locale}
          toasts={toasts}
          dismissToast={dismissToast}
          permReq={permReq}
          answerPermission={answerPermission}
          bookmarks={bookmarks}
        />
      </div>
      <CursorOverlay />
    </I18nProvider>
  );
}
