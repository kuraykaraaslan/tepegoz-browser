import {
  Suspense,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { INTERNAL_NEWTAB_URL } from '@tepegoz/desktop-ipc';
import type { AutofillAvailablePayload, Preferences, TabsState } from '@tepegoz/desktop-ipc';
import { AutofillSuggestion } from '@tepegoz/password-ui';
import { NewTabPage } from '@tepegoz/newtab-ui';
import { extensionIdFromPageUrl } from '../../shared/extension-urls';
import { extensionDefById, type ExtensionDef } from './extensions/registry';
import { AGENT_EXTENSION_ID, type ExtensionSurfacesResult } from './app-extension-surfaces';
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
  surfaceFallback: ReactNode;
  extSurfaces: ExtensionSurfacesResult;
  autofill: AutofillAvailablePayload | null;
  setAutofill: Dispatch<SetStateAction<AutofillAvailablePayload | null>>;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  reader: ReaderResult;
}

/**
 * The content region below the chrome: the web-view host plus the new-tab page, extension `page`/overlay
 * surfaces, the autofill suggestion, and the resizable sidebar dock. Split out of `App.tsx` (ADR-0010
 * 250-line cap).
 *
 * Settings/extensions/history/downloads/uploads/bookmarks (`tepegoz://…`) are no longer rendered here —
 * Faz 2/3 of `phases/tracks/protocol-tepegoz-pages.md` gave each a REAL `WebContentsView`
 * (`tabs-internal-page-view.ts`), laid over this same content area by main exactly like a web tab's
 * view. Their content is each page's own `*PageSurface.tsx`, loaded standalone. `tepegoz://tasks` has no
 * current UI (dead route) and was never rendered here either way.
 */
export function AppContent({
  contentRef,
  contentSnapshot,
  tabs,
  currentUrl,
  registry,
  prefs,
  surfaceFallback,
  extSurfaces,
  autofill,
  setAutofill,
  onUpdatePrefs,
  reader,
}: AppContentProps) {
  const activeTab = tabs.tabs.find((tb) => tb.id === tabs.activeId);

  // Internal pages are tabs addressed tepegoz://… ; render them when active.
  const currentBaseUrl = internalPageBase(currentUrl);
  const newTabActive = currentBaseUrl === INTERNAL_NEWTAB_URL;
  // An extension `page` surface: tepegoz://<extension-id> → render that extension's page component.
  const pageExtIds = registry.filter((d) => d.manifest.surfaces.includes('page')).map((d) => d.id);
  const pageExtId =
    activeTab !== undefined ? extensionIdFromPageUrl(activeTab.url, pageExtIds) : null;
  const PageSurface =
    pageExtId !== null ? extensionDefById(registry, pageExtId)?.surfaces.page : undefined;

  const {
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
        {/* The active tab's web page is a separate WebContentsView laid over this area by main. Extension
          `page` tabs and open overlay surfaces have no web view, so the chrome renders them here instead. */}
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
