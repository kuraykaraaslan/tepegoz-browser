import {
  Suspense,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { Locale } from '@tepegoz/i18n';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_NEWTAB_URL,
  INTERNAL_SETTINGS_URL,
  INTERNAL_UPLOADS_URL,
} from '@tepegoz/desktop-ipc';
import type {
  AutofillAvailablePayload,
  CredentialsStatus,
  ExtensionId,
  LoginCredentialMeta,
  Preferences,
  ProviderId,
  TabsState,
} from '@tepegoz/desktop-ipc';
import { AutofillSuggestion } from '@tepegoz/password-ui';
import { HistoryPage } from '@tepegoz/history-ui';
import { DownloadsPage } from '@tepegoz/downloads-ui';
import { UploadsPage } from '@tepegoz/uploads-ui';
import { NewTabPage } from '@tepegoz/newtab-ui';
import { BookmarksManager } from '@tepegoz/bookmarks-ui';
import { extensionIdFromPageUrl } from '../../shared/extension-urls';
import { extensionDefById, type ExtensionDef } from './extensions/registry';
import { ExtensionsPage } from './components/ExtensionsPage';
import { SettingsPage } from './components/SettingsPage';
import { bookmarkDialogAnchor, type BookmarksBarResult } from './app-bookmarks';
import { AGENT_EXTENSION_ID, type ExtensionSurfacesResult } from './app-extension-surfaces';
import type { OmniboxHistoryResult } from './app-omnibox-history';
import { internalPageBase, internalPageHash } from './App-helpers';
import { useAppContentModel } from './App-content-model';

export interface AppContentProps {
  contentRef: MutableRefObject<HTMLDivElement | null>;
  contentSnapshot: string | null;
  tabs: TabsState;
  currentUrl: string;
  registry: ExtensionDef[];
  prefs: Preferences | null;
  status: CredentialsStatus | null;
  locale: Locale;
  surfaceFallback: ReactNode;
  extSurfaces: ExtensionSurfacesResult;
  omniboxHistory: OmniboxHistoryResult;
  bookmarks: BookmarksBarResult;
  autofill: AutofillAvailablePayload | null;
  setAutofill: Dispatch<SetStateAction<AutofillAvailablePayload | null>>;
  loginCredentials: LoginCredentialMeta[];
  refreshLogins: () => Promise<void>;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  onResetPrefs: () => Promise<void>;
  onAddKey: (provider: ProviderId, label: string, apiKey: string) => Promise<void>;
  onRemoveKeyById: (id: string) => Promise<void>;
  onRenameKey: (id: string, label: string) => Promise<void>;
  onSetKeyModel: (id: string, model: string) => Promise<void>;
  onReorderKeys: (orderedIds: string[]) => Promise<void>;
  onToggleExtension: (id: ExtensionId, enabled: boolean) => void;
}

/**
 * The content region below the chrome: the web-view host plus the internal app pages (new tab, settings,
 * extensions, history, downloads, uploads, bookmarks), extension `page`/overlay surfaces, the autofill
 * suggestion, and the resizable sidebar dock. Split out of `App.tsx` (ADR-0010 250-line cap).
 */
export function AppContent({
  contentRef,
  contentSnapshot,
  tabs,
  currentUrl,
  registry,
  prefs,
  status,
  locale,
  surfaceFallback,
  extSurfaces,
  omniboxHistory,
  bookmarks,
  autofill,
  setAutofill,
  loginCredentials,
  refreshLogins,
  onUpdatePrefs,
  onResetPrefs,
  onAddKey,
  onRemoveKeyById,
  onRenameKey,
  onSetKeyModel,
  onReorderKeys,
  onToggleExtension,
}: AppContentProps) {
  const activeTab = tabs.tabs.find((tb) => tb.id === tabs.activeId);

  // Internal pages are tabs addressed tepegoz://… ; render them when active.
  const currentBaseUrl = internalPageBase(currentUrl);
  const newTabActive = currentBaseUrl === INTERNAL_NEWTAB_URL;
  const settingsActive = currentBaseUrl === INTERNAL_SETTINGS_URL;
  const extensionsActive = currentBaseUrl === INTERNAL_EXTENSIONS_URL;
  const historyActive = currentBaseUrl === INTERNAL_HISTORY_URL;
  const downloadsActive = currentBaseUrl === INTERNAL_DOWNLOADS_URL;
  const uploadsActive = currentBaseUrl === INTERNAL_UPLOADS_URL;
  const bookmarksActive = currentBaseUrl === INTERNAL_BOOKMARKS_URL;
  const settingsSectionId = settingsActive ? internalPageHash(currentUrl) : '';
  // An extension `page` surface: tepegoz://<extension-id> → render that extension's page component.
  const pageExtIds = registry.filter((d) => d.manifest.surfaces.includes('page')).map((d) => d.id);
  const pageExtId =
    activeTab !== undefined ? extensionIdFromPageUrl(activeTab.url, pageExtIds) : null;
  const PageSurface =
    pageExtId !== null ? extensionDefById(registry, pageExtId)?.surfaces.page : undefined;

  const extensionStates = prefs?.extensions ?? [];

  const {
    downloadList,
    downloadCommand,
    downloadSubscribe,
    uploadList,
    uploadCommand,
    uploadSubscribe,
    newTabShortcuts,
    onAddShortcut,
    onEditShortcut,
    onRemoveShortcut,
    resolvedNewTabBackground,
    onChangeNewTabBackground,
    onPickNewTabBackgroundImage,
    onNewTabSearch,
  } = useAppContentModel(prefs, onUpdatePrefs, tabs.activeId);

  // Opaque base so the glass (transparent .app-shell) is confined to the chrome bars and never bleeds
  // into the content/sidebar region between a web view detaching and an internal page paint.
  return (
    <div className="relative flex flex-1 overflow-hidden bg-surface-base">
      {/* Left region = the web-view area (its bounds are measured from contentRef, so they exclude
          the sidebar); the resizable sidebar dock sits to its right. */}
      <div ref={contentRef} className="relative flex-1 overflow-hidden">
        {/* The active tab's web page is a separate WebContentsView laid over this area by main. The
          internal app tabs (Settings/Extensions/History), extension `page` tabs, and open overlay
          surfaces have no web view, so the chrome renders them here instead. */}
        {contentSnapshot !== null && (
          // A still of the page shown while the live web view is hidden for chrome overlays.
          <img
            src={contentSnapshot}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-left-top"
          />
        )}
        {newTabActive && (
          <div className="absolute inset-0 bg-surface-system">
            <NewTabPage
              shortcuts={newTabShortcuts}
              onOpenShortcut={(url) => window.tepegoz.navigateTab(url)}
              onSearch={onNewTabSearch}
              onOpenAgent={() => extSurfaces.runExtensionAction(AGENT_EXTENSION_ID, 'click')}
              onAddShortcut={onAddShortcut}
              onEditShortcut={onEditShortcut}
              onRemoveShortcut={onRemoveShortcut}
              background={resolvedNewTabBackground}
              onChangeBackground={onChangeNewTabBackground}
              onPickBackgroundImage={onPickNewTabBackgroundImage}
            />
          </div>
        )}
        {settingsActive && (
          <div className="absolute inset-0 bg-surface-system">
            {prefs && status ? (
              <SettingsPage
                initialSectionId={settingsSectionId}
                prefs={prefs}
                status={status}
                onUpdatePrefs={onUpdatePrefs}
                onResetPrefs={onResetPrefs}
                onAddKey={onAddKey}
                onRemoveKeyById={onRemoveKeyById}
                onRenameKey={onRenameKey}
                onSetKeyModel={onSetKeyModel}
                onReorderKeys={onReorderKeys}
                loginCredentials={loginCredentials}
                onLoginSectionMount={refreshLogins}
                onAddLogin={(c) =>
                  window.tepegoz.setLogin(c).then(async () => {
                    await refreshLogins();
                  })
                }
                onRemoveLogin={(id) =>
                  window.tepegoz.removeLogin(id).then(async () => {
                    await refreshLogins();
                  })
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
            <UploadsPage list={uploadList} command={uploadCommand} subscribe={uploadSubscribe} />
          </div>
        )}
        {bookmarksActive && (
          <div className="absolute inset-0 bg-surface-system">
            <BookmarksManager
              getTree={bookmarks.getBookmarkTree}
              refreshKey={bookmarks.bookmarksVersion}
              onMove={bookmarks.onBookmarkMove}
              onNewFolder={(parentId) =>
                window.tepegoz.openPopup('bookmark-add-folder', bookmarkDialogAnchor(), {
                  id: parentId,
                })
              }
              onOpen={(url) => window.tepegoz.navigateTab(url)}
              onContextMenu={(id, type) => window.tepegoz.showBookmarkContextMenu(id, type)}
              onExport={() => window.tepegoz.exportBookmarks()}
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
  );
}
