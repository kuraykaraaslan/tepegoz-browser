/**
 * Shell-UI slice of {@link TepegozApi} — native popups/submenus, the web-page context menu, history,
 * bookmarks, the notification center, and the file-access/new-tab-background pickers. Type-only imports
 * keep this dependency-free for the sandboxed preload; composed into the full surface by `api.ts`.
 */
import type {
  ContentBounds,
  BasicAuthRequest,
  BasicAuthResponse,
  CertificateErrorRequest,
  CertificateErrorResponse,
  ClientCertificateChoice,
  ClientCertificateRequest,
  ClientCertificateResponse,
} from './contract';
import type { PageMenuAction, PageMenuContext, PageMenuContributionActionInput } from './contract';
import type { HistoryEntry } from './contract';
import type { SiteClearPlan } from './contract';
import type { BookmarkEntry, BookmarkNodeType, BookmarkTreeNode } from './contract';
import type { BookmarkImportInput, BookmarkImportResult } from './contract';
import type { BookmarkMenuAction } from './contract';
import type { AppNotification, NotificationState } from './contract';
import type { NotificationPermissionRequest, NotificationPermissionResponse } from './contract';
import type { FileAccessFolderPickResult, NewTabBackgroundImagePick } from './preferences-types';

export interface UiApi {
  /** Open a named app surface as a native floating popup window anchored at `anchor` (the trigger's
   *  rect, in window-content DIP). Floats above the page, which stays live behind it. Reusable across
   *  surfaces: `surface` is the kind ('main-menu' | 'ext'); extensions pass their id via `opts.id`;
   *  `opts.height` requests a content height (clamped to the work area). */
  openPopup(surface: string, anchor: ContentBounds, opts?: { id?: string; height?: number }): void;
  /** Report the open popup's measured content height (px) so main shrinks the window to fit — removing
   *  the empty strip left by the open-time height estimate. Clamped to the work area in main. */
  resizePopup(height: number): void;
  /** Close the open popup window (also auto-closes on blur/Escape). */
  closePopup(): void;
  /** Subscribe to popup-closed notifications; the callback receives the closed surface key
   *  ('main-menu' | `ext:<id>`). Returns an unsubscribe fn. */
  onPopupClosed(callback: (surface: string) => void): () => void;
  /** Quit the whole app (Exit). Distinct from `closeWindow` so it works when invoked from a popup
   *  window (where the sender-window path would close the popup, not the main window). */
  quitApp(): void;
  /** Open a submenu flyout as its own native window to the LEFT of the main-menu popup, vertically
   *  aligned to `anchor` (the hovered row's rect). `kind` selects the content (e.g. 'history'|'extensions').
   *  Replaces any open flyout. */
  openSubmenu(kind: string, anchor: ContentBounds, opts?: { height?: number }): void;
  /** Close the submenu flyout, if one is open. */
  closeSubmenu(): void;
  // Web-page right-click menu (rendered popup surface `page-context-menu`, opened from main).
  /** Read the context captured at the last right-click, so the popup can enable/disable its rows. */
  getPageMenuContext(): Promise<PageMenuContext>;
  /** Run a wired page-menu action against the captured context (acted on in the main process). */
  pageMenuAction(action: PageMenuAction): void;
  /** Run a contributed page-menu action against the menu captured at right-click time. */
  pageMenuContributionAction(input: PageMenuContributionActionInput): void;
  // Browsing history (tepegoz://history).
  getHistory(params?: { limit?: number; offset?: number }): Promise<HistoryEntry[]>;
  searchHistory(params: {
    query: string;
    limit?: number;
    offset?: number;
  }): Promise<HistoryEntry[]>;
  deleteHistory(url: string): Promise<void>;
  clearHistory(): Promise<void>;
  /**
   * What a "forget this site" would cover and what it would break, WITHOUT doing it (Phase 2).
   * Null when the URL has no site to scope to. The dialog is built from this, so the warning
   * arrives before the confirmation rather than after the damage.
   */
  planSiteDataClear(url: string): Promise<SiteClearPlan | null>;
  /** Perform the clear the user just confirmed; resolves with what was actually cleared. */
  clearSiteData(url: string): Promise<SiteClearPlan | null>;
  // Bookmarks. Only http(s) pages are bookmarkable (internal tepegoz:// pages are rejected in main).
  /** All bookmarks, newest-first. */
  listBookmarks(): Promise<BookmarkEntry[]>;
  /** Add the page if absent, else remove it. Returns the resulting bookmarked state. */
  toggleBookmark(url: string, title: string, favicon?: string | null): Promise<boolean>;
  /** Whether a URL is currently bookmarked (drives the star's filled/outline state). */
  isBookmarked(url: string): Promise<boolean>;
  // Bookmark tree (folders + ordering) — the interactive bar + manager page.
  /** The full forest: [Bookmarks bar, Other bookmarks], each with its subtree. */
  getBookmarkTree(): Promise<BookmarkTreeNode[]>;
  /** Import a browser-exported bookmarks file into the local bookmark tree. */
  importBookmarks(input: BookmarkImportInput): Promise<BookmarkImportResult>;
  /** The whole collection as Netscape bookmarks HTML. The renderer saves it; main never writes a file. */
  exportBookmarks(): Promise<string>;
  /** Per-origin client-certificate decisions this run remembers (origins only — never the subject). */
  listClientCertificateChoices(): Promise<ClientCertificateChoice[]>;
  /** Forget them all, so the next request asks again. Nothing already sent is recalled by this. */
  forgetClientCertificateChoices(): Promise<void>;
  /** Create a folder under `parentId` (defaults to end); resolves when persisted. */
  createBookmarkFolder(parentId: string, title: string, index?: number): Promise<void>;
  /** Rename a node (bookmark or folder). */
  renameBookmark(id: string, title: string): Promise<void>;
  /** Delete a node (folders delete their contents too). */
  removeBookmark(id: string): Promise<void>;
  /** Reparent + reorder a node to `index` within `newParentId` (drag-drop). */
  moveBookmark(id: string, newParentId: string, index: number): Promise<void>;
  /** Pop the native right-click menu for a bar/manager node. `variant` 'folder-item' is the reduced
   *  menu used inside a bar folder-dropdown popup. */
  showBookmarkContextMenu(
    id: string,
    type: BookmarkNodeType,
    variant?: 'default' | 'folder-item',
  ): void;
  /** Subscribe to native-menu action choices (main→renderer); returns an unsubscribe fn. */
  onBookmarkMenuAction(callback: (action: BookmarkMenuAction) => void): () => void;
  /** Subscribe to "bookmark tree changed" pushes (incl. from popup windows); returns an unsubscribe fn. */
  onBookmarksChanged(callback: () => void): () => void;
  // Notification center. State is pushed live from main; the renderer mutates via fire-and-forget.
  /** Current center snapshot (items + unread count). */
  listNotifications(): Promise<NotificationState>;
  /** Subscribe to live center-state pushes; returns an unsubscribe fn. */
  onNotificationsState(callback: (state: NotificationState) => void): () => void;
  /** Subscribe to transient toasts (channel `toast`); returns an unsubscribe fn. */
  onNotificationToast(callback: (toast: AppNotification) => void): () => void;
  dismissNotification(id: string): void;
  dismissAllNotifications(): void;
  markNotificationRead(id: string): void;
  markAllNotificationsRead(): void;
  /** Subscribe to per-site Web Notification consent prompts; returns an unsubscribe fn. */
  onNotificationPermissionRequest(
    callback: (request: NotificationPermissionRequest) => void,
  ): () => void;
  /** Answer a pending consent prompt (allow/deny, optionally remembered for the origin). */
  respondNotificationPermission(response: NotificationPermissionResponse): void;
  /** Main→renderer: an HTTP 401/407 challenge needs credentials. */
  onBasicAuthRequest(callback: (request: BasicAuthRequest) => void): () => void;
  /** Renderer→main: the credentials, or a cancellation. Never stored on either side. */
  respondBasicAuth(response: BasicAuthResponse): void;
  /** Main→renderer: a TLS certificate error needs a decision. */
  onCertificateErrorRequest(callback: (request: CertificateErrorRequest) => void): () => void;
  /** Renderer→main: proceed past it, or refuse. */
  respondCertificateError(response: CertificateErrorResponse): void;
  /** Main→renderer: a site is asking the user to identify themselves with a client certificate. */
  onClientCertificateRequest(callback: (request: ClientCertificateRequest) => void): () => void;
  /** Renderer→main: which offered certificate to send, or none. */
  respondClientCertificate(response: ClientCertificateResponse): void;
  // File operations (Settings → File operations). The grant list is read/written through preferences
  // (`getPreferences().fileAccessGrants` / `updatePreferences({ fileAccessGrants })`); the AI-driven
  // consent reuses the agent HITL modal. Only the native folder picker needs its own bridge method.
  /** Open the native directory picker; returns the chosen absolute folder path(s). */
  pickFileAccessFolder(): Promise<FileAccessFolderPickResult>;
  // New-tab page background image (Customize → Upload image). Bytes are read + validated in main and
  // stored in the content-addressed blob store; only a `cas://` ref is persisted in preferences.
  /** Open a native image picker; stores the chosen file and returns its `cas://` ref + a `data:` URL. */
  pickNewTabBackgroundImage(): Promise<NewTabBackgroundImagePick>;
  /** Resolve a stored background-image ref (`cas://`) to a `data:` URL, or null if missing. */
  getNewTabBackgroundImage(ref: string): Promise<string | null>;
}
