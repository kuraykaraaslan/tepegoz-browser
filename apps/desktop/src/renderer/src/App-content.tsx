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
  INTERNAL_UPLOADS_URL,
} from '@tepegoz/desktop-ipc';
import type { AutofillAvailablePayload, ExtensionId, Preferences, TabsState } from '@tepegoz/desktop-ipc';
import { AutofillSuggestion } from '@tepegoz/password-ui';
import { HistoryPage } from '@tepegoz/history-ui';
import { DownloadsPage } from '@tepegoz/downloads-ui';
import { UploadsPage } from '@tepegoz/uploads-ui';
import { NewTabPage } from '@tepegoz/newtab-ui';
import { BookmarksManager } from '@tepegoz/bookmarks-ui';
import { extensionIdFromPageUrl } from '../../shared/extension-urls';
import { extensionDefById, type ExtensionDef } from './extensions/registry';
import { ExtensionsPage } from './components/ExtensionsPage';
import { bookmarkDialogAnchor, type BookmarksBarResult } from './app-bookmarks';
import { AGENT_EXTENSION_ID, type ExtensionSurfacesResult } from './app-extension-surfaces';
import type { OmniboxHistoryResult } from './app-omnibox-history';
import { internalPageBase } from './App-helpers';
import { useAppContentModel } from './App-content-model';
import { ReaderSurface } from './components/ReaderSurface';
import type { ReaderResult } from './app-reader';

export interface AppContentProps {
  contentRef: MutableRefObject<HTMLDivElement | null>;
  contentSnapshot: string | null;
  tabs: TabsState;
  currentUrl: string;
  registry: ExtensionDef[];
  prefs: Preferences | null;
  locale: Locale;
  surfaceFallback: ReactNode;
  extSurfaces: ExtensionSurfacesResult;
  omniboxHistory: OmniboxHistoryResult;
  bookmarks: BookmarksBarResult;
  autofill: AutofillAvailablePayload | null;
  setAutofill: Dispatch<SetStateAction<AutofillAvailablePayload | null>>;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  reader: ReaderResult;
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
  locale,
  surfaceFallback,
  extSurfaces,
  omniboxHistory,
  bookmarks,
  autofill,
  setAutofill,
  onUpdatePrefs,
  reader,
  onToggleExtension,
}: AppContentProps) {
  const activeTab = tabs.tabs.find((tb) => tb.id === tabs.activeId);

  // Internal pages are tabs addressed tepegoz://… ; render them when active.
  const currentBaseUrl = internalPageBase(currentUrl);
  const newTabActive = currentBaseUrl === INTERNAL_NEWTAB_URL;
  const extensionsActive = currentBaseUrl === INTERNAL_EXTENSIONS_URL;
  const historyActive = currentBaseUrl === INTERNAL_HISTORY_URL;
  const downloadsActive = currentBaseUrl === INTERNAL_DOWNLOADS_URL;
  const uploadsActive = currentBaseUrl === INTERNAL_UPLOADS_URL;
  const bookmarksActive = currentBaseUrl === INTERNAL_BOOKMARKS_URL;
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
        {/* Settings (tepegoz://settings) is no longer rendered here — Faz 2 of
            phases/tracks/protocol-tepegoz-pages.md gave it a REAL WebContentsView
            (tabs-internal-page-view.ts), laid over this same content area by main exactly like a web
            tab's view. Its content is `SettingsPageSurface.tsx`, loaded standalone. */}
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
              onSetTags={(id, tags) => window.tepegoz.setBookmarkTags(id, tags)}
              onExport={() => window.tepegoz.exportBookmarks()}
            />
          </div>
        )}
        {/* The reading view sits ABOVE every other surface: the user asked for it about the page they
            are looking at, so it must not be occluded by an internal page that happens to be open. */}
        <ReaderSurface reader={reader.reader} onClose={reader.closeReader} />
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
