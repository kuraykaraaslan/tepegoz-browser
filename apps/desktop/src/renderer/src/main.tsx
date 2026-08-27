import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { coreDict, pick, resolveLocale } from '@tepegoz/i18n';
import { ErrorBoundary } from '@tepegoz/ui';
import { App } from './App';
import { PopupApp } from './components/PopupApp';
import { MainMenuPopup } from './components/MainMenuPopup';
import { MenuSubPopup } from './components/MenuSubPopup';
import { ExtensionsPanelPopup } from './components/ExtensionsPanelPopup';
import { PageContextMenuPopup } from './components/PageContextMenuPopup';
import { UserMenuPopup } from './components/UserMenuPopup';
import { NotificationCenterPopup } from './components/NotificationCenterPopup';
import { TransferActivityPopup } from './components/TransferActivityPopup';
import { BookmarkFolderPopup } from './components/BookmarkFolderPopup';
import { BookmarkDialogPopup } from './components/BookmarkDialogPopup';
import { OnboardingApp } from './components/OnboardingApp';
import { SettingsPageSurface } from './components/SettingsPageSurface';
import { ExtensionsPageSurface } from './components/ExtensionsPageSurface';
import { HistoryPageSurface } from './components/HistoryPageSurface';
import { DownloadsPageSurface } from './components/DownloadsPageSurface';
import { UploadsPageSurface } from './components/UploadsPageSurface';
import { BookmarksPageSurface } from './components/BookmarksPageSurface';
import { ProcessPageSurface } from './components/ProcessPageSurface';
import { DragPreviewSurface } from './components/DragPreviewSurface';
import { applyTheme } from './lib/theme';
import './styles.css';

// A native popup window loads this same bundle with `?surface=<kind>` (see PopupWindowManager); render
// only that surface. Add a case here to host a new popup surface. Absent → the full browser chrome.
const params = new URLSearchParams(window.location.search);
const surface = params.get('surface');
const extId = params.get('id');

// Popups carry the resolved theme in the URL (PopupWindowManager passes it from persisted prefs) so we
// apply it BEFORE the first React paint — the async getPreferences() re-apply inside each popup then
// only confirms it. Without this the popup mounts on the token default and visibly repaints (flash).
// The main App window (no `theme` param) keeps owning its own theme lifecycle.
const themeParam = params.get('theme');
if (themeParam !== null) applyTheme(themeParam, params.get('themeColor') ?? '');

// The drag-preview floats in a transparent, click-through window. styles.css paints the app background
// on <html>/<body>/#root, which would otherwise show through as an opaque box — strip it so only the
// chip is visible, and kill scrollbars (the window is sized to the chip).
if (surface === 'drag-preview') {
  document.documentElement.style.background = 'transparent';
  const { style } = document.body;
  style.background = 'transparent';
  style.margin = '0';
  style.overflow = 'hidden';
}

// A `tepegoz://<host>` document (a real page loaded into a tab's WebContentsView, not a popup window —
// see internal-pages/protocol.ts and tabs-internal-page-view.ts) picks its surface by HOSTNAME instead
// of `?surface=`: it is not a popup, so there is no window-creation call site to attach a query string
// to. Growing REAL_PAGE_HOSTS in protocol.ts is what adds a case here (Faz 3 of the plan doc).
const internalPageHost = window.location.protocol === 'tepegoz:' ? window.location.hostname : null;

let node: ReactNode = <App />;
if (internalPageHost === 'settings') node = <SettingsPageSurface />;
else if (internalPageHost === 'extensions') node = <ExtensionsPageSurface />;
else if (internalPageHost === 'history') node = <HistoryPageSurface />;
else if (internalPageHost === 'downloads') node = <DownloadsPageSurface />;
else if (internalPageHost === 'uploads') node = <UploadsPageSurface />;
else if (internalPageHost === 'bookmarks') node = <BookmarksPageSurface />;
else if (internalPageHost === 'process') node = <ProcessPageSurface />;
else if (surface === 'main-menu') node = <MainMenuPopup />;
else if (surface === 'page-context-menu') node = <PageContextMenuPopup />;
else if (surface === 'user-menu') node = <UserMenuPopup />;
else if (surface === 'menu-sub') node = <MenuSubPopup kind={params.get('kind') ?? ''} />;
else if (surface === 'extensions-panel') node = <ExtensionsPanelPopup />;
else if (surface === 'notifications') node = <NotificationCenterPopup />;
else if (surface === 'transfers') node = <TransferActivityPopup />;
else if (surface === 'bookmark-folder' && extId !== null)
  node = <BookmarkFolderPopup folderId={extId} />;
else if (surface === 'bookmark-rename' && extId !== null)
  node = <BookmarkDialogPopup mode="rename" id={extId} />;
else if (surface === 'bookmark-add-folder' && extId !== null)
  node = <BookmarkDialogPopup mode="add-folder" id={extId} />;
else if (surface === 'onboarding') node = <OnboardingApp />;
else if (surface === 'drag-preview')
  node = (
    <DragPreviewSurface
      title={params.get('title') ?? ''}
      faviconUrl={params.get('favicon')}
      active={params.get('active') === '1'}
      pinned={params.get('pinned') === '1'}
      groupColor={params.get('groupColor')}
      kind={params.get('kind') === 'group' ? 'group' : 'tab'}
    />
  );
else if (surface === 'ext' && extId !== null) node = <PopupApp id={extId} />;

// The boundary's fallback renders when App (and its locale state) is gone — resolve from the OS locale.
const fallbackMessage = pick(coreDict, resolveLocale(navigator.language)).errors.renderFailure;

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary fallbackMessage={fallbackMessage}>{node}</ErrorBoundary>
    </StrictMode>,
  );
}
