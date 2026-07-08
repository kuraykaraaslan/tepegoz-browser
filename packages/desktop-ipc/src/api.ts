/**
 * The `TepegozApi` surface bridged to `window.tepegoz` in the renderer (split out of `contract.ts`
 * per ADR-0010's 250-line file cap). Type-only imports throughout — including from `contract.ts`
 * itself — so this stays dependency-free for the sandboxed preload; a type-only circular import with
 * `contract.ts` is erased at compile time and carries no runtime cycle.
 */
import type {
  AdblockSettings,
  AdblockState,
  AgentApprovalRequest,
  AgentConfig,
  AgentAutonomy,
  AgentEffort,
  AgentEvent,
  AgentFileAttachment,
  AgentPlanPreview,
  AgentRunResult,
  TokenUsageSnapshot,
} from './contract';
import type { PopupBlockerRequest, PopupBlockerSettings } from './contract';
import type { HistoryEntry } from './contract';
import type { BookmarkEntry, BookmarkNodeType, BookmarkTreeNode } from './contract';
import type { BookmarkImportInput, BookmarkImportResult } from './contract';
import type { BookmarkMenuAction } from './contract';
import type { AppNotification, NotificationState } from './contract';
import type {
  Macro,
  MacroRecordedStep,
  MacroRunDraftInput,
  MacroRunInput,
  MacroRunProgress,
  MacroSummary,
} from './contract';
import type { AppInfo, ContentBounds, CredentialsStatus } from './contract';
import type { DownloadCommandInput, DownloadRecord, DownloadsState } from './contract';
import type { UploadCommandInput, UploadRecord, UploadsState } from './contract';
import type {
  TaskArtifactRecord,
  TaskCommandInput,
  TaskDefinition,
  TaskRunRecord,
  TaskSaveInput,
  TasksState,
} from './contract';
import type {
  AgentConversationDetail,
  AgentConversationListInput,
  AgentConversationOpenInput,
  AgentConversationSummary,
  AgentConversationsState,
} from './contract';
import type { ProviderId, ProviderKeyMeta } from './contract';
import type { AdaptorConnection } from './contract';
import type { ExtensionId, ExtensionManifestWire, ExtensionContextMenuChoice } from './contract';
import type { PageMenuAction, PageMenuContext } from './contract';
import type { LoginCredentialMeta, LoginImportResult, AutofillAvailablePayload } from './contract';
import type { NotificationPermissionRequest, NotificationPermissionResponse } from './contract';
import type { PublicSettings } from './public-settings';
import type {
  Preferences,
  LocalModelInfo,
  McpServerStatusInfo,
  FileAccessFolderPickResult,
  NewTabBackgroundImagePick,
} from './preferences-types';
import type {
  TabDragBegin,
  TabDragPoint,
  TabGroupColor,
  TabGroupSettingKey,
  TabGroupSettingValue,
  TabsState,
  TabStripGeometry,
} from './tabs-types';
import type { AIAdaptor } from './ai-adaptor-types';

/** The exact surface bridged to `window.tepegoz` in the renderer. */
export interface TepegozApi {
  getAppInfo(): Promise<AppInfo>;
  getPreferences(): Promise<Preferences>;
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>;
  /** Reset all preferences to defaults. Encrypted credentials (the vault) are NOT affected. */
  resetPreferences(): Promise<Preferences>;
  /** Finish the first-run welcome flow and load the normal browser chrome. */
  completeOnboarding(): Promise<void>;
  /** The curated PUBLIC settings snapshot exposed to extensions (read-only; never carries secrets). */
  getPublicSettings(): Promise<PublicSettings>;
  /** Subscribe to public-settings changes; returns an unsubscribe function (like `onTabsState`). */
  onPublicSettingsChanged(callback: (settings: PublicSettings) => void): () => void;
  getCredentialsStatus(): Promise<CredentialsStatus>;
  /** Every stored key's metadata (no secret). Any number of keys per provider. */
  listCredentials(): Promise<ProviderKeyMeta[]>;
  /** Renderer → main only (user-entered key). The raw key never flows back to the renderer. */
  addProviderKey(provider: ProviderId, label: string, apiKey: string): Promise<CredentialsStatus>;
  /** Remove one stored key by its id. */
  removeProviderKeyById(id: string): Promise<CredentialsStatus>;
  /** Rename one stored key by its id (label only — the secret is untouched). */
  renameProviderKey(id: string, label: string): Promise<CredentialsStatus>;
  /** Reorder all keys (drag-drop priority). The top key's provider becomes the default provider. */
  reorderProviderKeys(orderedIds: string[]): Promise<CredentialsStatus>;
  // Custom window chrome (frameless): caption controls.
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  isWindowMaximized(): Promise<boolean>;
  /** Subscribe to maximize/restore state changes; returns an unsubscribe function. */
  onWindowMaximizedChange(callback: (maximized: boolean) => void): () => void;
  // Browser tabs (each is an isolated WebContentsView in the main process).
  createTab(url?: string): void;
  /** Open a URL in a background tab (does not steal focus). */
  createTabInBackground(url: string): void;
  closeTab(id: string): void;
  activateTab(id: string): void;
  /** Pop the native right-click menu for a tab (Chrome-style), acted on in the main process. */
  showTabContextMenu(id: string): void;
  /** Navigate the ACTIVE tab (omnibox). */
  navigateTab(input: string): void;
  tabGoBack(): void;
  tabGoForward(): void;
  tabReload(): void;
  /** Navigate the ACTIVE tab to the home / start page. */
  tabHome(): void;
  /** Reopen the most-recently-closed tab (Ctrl+Shift+T). */
  reopenClosedTab(): void;
  // Advanced tab UX (ADR-0020): drag-reorder, groups, pinning. All fire-and-forget; state arrives via
  // `onTabsState`.
  /** Drag-reorder a tab to `toIndex`. `intoGroupId`: a group id joins it, null ungroups, omitted infers. */
  moveTab(id: string, toIndex: number, intoGroupId?: string | null): void;
  /** Pin or unpin a tab (pinned tabs sit at the front and leave any group). */
  setTabPinned(id: string, pinned: boolean): void;
  /** Create a group from `memberIds` (empty/omitted → the active tab). */
  createTabGroup(memberIds?: string[]): void;
  /** Reorder a whole group's run to `toIndex` among the non-member tabs. */
  moveTabGroup(groupId: string, toIndex: number): void;
  /** Patch a group's name/color/collapsed (only provided keys change). */
  updateTabGroup(
    groupId: string,
    patch: {
      name?: string;
      color?: TabGroupColor;
      collapsed?: boolean;
      settings?: Record<TabGroupSettingKey, TabGroupSettingValue>;
    },
  ): void;
  /** Add a tab to an existing group. */
  assignTabToGroup(tabId: string, groupId: string): void;
  /** Remove a tab from its group (it becomes ungrouped). */
  removeTabFromGroup(tabId: string): void;
  /** Dissolve a group (its tabs become ungrouped). */
  ungroupTabGroup(groupId: string): void;
  /** Pop the native group context menu (right-click a group header), acted on in the main process. */
  showTabGroupContextMenu(groupId: string): void;
  /** Main→renderer: open the inline rename editor for a group (from the native "Rename" menu item). */
  onTabGroupStartRename(callback: (groupId: string) => void): () => void;
  /** Report the content-area rect so main can lay out the active web view below the chrome. */
  setContentBounds(bounds: ContentBounds): void;
  /** Hide/show the web view so a chrome overlay (e.g. Settings) can take the content area. */
  setContentVisible(visible: boolean): void;
  /** Snapshot the active web view as a PNG data URL (or null if none), so the chrome can show a still
   *  of the page while the live view is briefly hidden — e.g. during a sidebar resize drag. */
  captureActiveTab(): Promise<string | null>;
  getTabsState(): Promise<TabsState>;
  onTabsState(callback: (state: TabsState) => void): () => void;
  // Chrome-like tab tear-off. The strip streams the drag once it leaves the strip; main drives a
  // floating preview window and performs the cross-window move (merge / new window) on release.
  /** A strip drag has torn out: begin a tear session and show the floating preview chip. */
  beginTabDrag(payload: TabDragBegin): void;
  /** Reposition the floating preview to the cursor (screen coords) during a torn drag. */
  moveTabDrag(point: TabDragPoint): void;
  /** Torn drag released: main hit-tests the drop → merge into a window's strip, or a new window. */
  endTabDrag(point: TabDragPoint): void;
  /** Torn drag cancelled (Esc / invalid): tear down the preview, no move. */
  cancelTabDrag(): void;
  /** Report this window's strip geometry (client coords) so main can hit-test cross-window drops. */
  reportTabStrip(geometry: TabStripGeometry): void;
  /** Open a fresh empty browser window (main-menu "New window"). */
  newWindow(): void;
  // Agent (Do mode): run a task, stream live events, answer HITL approvals.
  /** Ensure the active tab belongs to a group (creates one if needed). Returns the groupId. */
  ensureActiveGroup(): Promise<string>;
  /** Subscribe to active-tab-group changes; returns an unsubscribe function. */
  onActiveGroupChange(callback: (groupId: string | null) => void): () => void;
  /** Start an agentic task on the active tab; resolves when the run finishes. */
  runAgent(input: {
    prompt: string;
    groupId: string;
    displayPrompt?: string;
    attachmentMeta?: {
      kind: 'selection' | 'file' | 'screenshot';
      label: string;
      mimeType?: string;
      sizeBytes?: number;
    }[];
  }): Promise<AgentRunResult>;
  /** Cancel an in-flight run. */
  cancelAgent(runId: string): void;
  /** The active tab's committed URL, or null when there's no web tab (seeds a converted task's target). */
  getActiveTabUrl(): Promise<string | null>;
  /** Reset conversation memory for a specific group (panel "New task"). */
  newAgentConversation(groupId: string): void;
  listAgentConversations(input?: AgentConversationListInput): Promise<AgentConversationSummary[]>;
  getAgentConversation(id: string): Promise<AgentConversationDetail | null>;
  getCurrentAgentConversation(groupId: string): Promise<AgentConversationDetail | null>;
  openAgentConversation(input: AgentConversationOpenInput): Promise<AgentConversationDetail | null>;
  deleteAgentConversation(id: string): Promise<void>;
  clearAgentConversations(): Promise<void>;
  onAgentConversationsState(callback: (state: AgentConversationsState) => void): () => void;
  /** Subscribe to the live Agent Console event stream; returns an unsubscribe function. */
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  /** Subscribe to HITL approval prompts; returns an unsubscribe function. */
  onAgentApprovalRequest(callback: (request: AgentApprovalRequest) => void): () => void;
  /** Answer a HITL prompt (approve/deny a gated tool call). */
  respondAgentApproval(approvalId: string, approved: boolean): void;
  /** Subscribe to the editable plan preview shown before the agent loop runs. */
  onAgentPlanPreview(callback: (preview: AgentPlanPreview) => void): () => void;
  /** Approve (optionally skipping some steps) or reject a proposed plan before execution. */
  respondAgentPlan(planId: string, approved: boolean, skipStepIds?: string[]): void;
  /** Subscribe to token-usage updates for the quota indicator; returns an unsubscribe function. */
  onTokenUsage(callback: (usage: TokenUsageSnapshot) => void): () => void;
  /** Fetch the current token-usage snapshot. */
  getTokenUsage(): Promise<TokenUsageSnapshot>;
  /** Agent panel: current provider + selectable choices + autonomy level. */
  getAgentConfig(): Promise<AgentConfig>;
  /** Agent panel: set the per-run provider override (model selector). */
  setAgentProvider(provider: ProviderId): Promise<void>;
  /** Agent panel: set the autonomy level (mode dropdown). */
  setAgentAutonomy(level: AgentAutonomy): Promise<void>;
  /** Agent panel: set the reasoning-effort preset (effort dropdown). */
  setAgentEffort(level: AgentEffort): Promise<void>;
  /** Open a file the agent produced, gated to the whitelisted folders (fire-and-forget). */
  openAgentFile(path: string): void;
  /** Capture the active page's current text selection. Returns empty string when nothing is selected. */
  capturePageSelection(): Promise<string>;
  /** Open a native file picker and return the selected files' content. */
  pickAgentFiles(): Promise<AgentFileAttachment[]>;
  /** Snapshot the active tab as a PNG data URL for use as a composer attachment (alias of captureActiveTab). */
  capturePageScreenshot(): Promise<string | null>;
  // On-device model management (Settings → Providers → Local).
  /** The model catalog merged with live install/download state. */
  listLocalModels(): Promise<LocalModelInfo[]>;
  /** Start (or resume) downloading a model into the profile; progress streams via onLocalModelsState. */
  downloadLocalModel(id: string): Promise<void>;
  /** Cancel an in-progress download. */
  cancelLocalModelDownload(id: string): void;
  /** Select an installed model for on-device runs. */
  selectLocalModel(id: string): Promise<void>;
  /** Delete a downloaded model file. */
  deleteLocalModel(id: string): Promise<void>;
  /** Subscribe to model list/state changes (download progress, install, select); returns unsubscribe. */
  onLocalModelsState(callback: (models: LocalModelInfo[]) => void): () => void;
  // User-Agent switcher extension: read/apply the UA override for browsed pages.
  /** The currently applied UA override (or null for the browser default). */
  getUserAgent(): Promise<string | null>;
  /** Apply a UA string for browsed pages, or null to reset to the default. Returns the stored value. */
  setUserAgent(ua: string | null): Promise<string | null>;
  // Popup Blocker (strict) extension: read/apply settings + trust an origin.
  /** The current popup-blocker settings. */
  getPopupBlockerSettings(): Promise<PopupBlockerSettings>;
  /** Patch popup-blocker settings (only provided keys change). Returns the stored settings. */
  setPopupBlockerSettings(patch: Partial<PopupBlockerSettings>): Promise<PopupBlockerSettings>;
  /** Add an origin to the popup-blocker trust allowlist (its future popups pass). */
  trustPopupOrigin(origin: string): void;
  /** The most-recent blocked-popup events this session (newest first, max 20). */
  getRecentRequests(): Promise<PopupBlockerRequest[]>;
  /** Read-only status of every configured MCP server (Settings → Connections). Never returns secrets. */
  getMcpStatus(): Promise<McpServerStatusInfo[]>;
  // Adblock Shield extension: network blocking, cosmetic filtering, per-site pause, and list refresh.
  /** The current adblock settings. */
  getAdblockSettings(): Promise<AdblockSettings>;
  /** Patch adblock settings (only provided keys change). Returns the stored settings. */
  setAdblockSettings(patch: Partial<AdblockSettings>): Promise<AdblockSettings>;
  /** Session-only adblock state: counters, engine status, last update, and recent blocked requests. */
  getAdblockState(): Promise<AdblockState>;
  /** Enable/disable adblock for one origin. `enabled=false` pauses protection for that site. */
  setAdblockSiteEnabled(origin: string, enabled: boolean): Promise<AdblockSettings>;
  /** Refresh filter lists; manual calls are cooldown-limited and preserve the old engine on failure. */
  refreshAdblockLists(): Promise<AdblockState>;
  /** Read-only adaptor inventory shown next to MCP tools in Settings. */
  listAdaptors(): Promise<AdaptorConnection[]>;
  /** The live AIAdaptor inventory (system + extension + MCP groups, each with its actions) for the
   *  Settings "run locally" list. Built from the single CapabilityRegistry, so it needs no maintenance. */
  listAiAdaptors(): Promise<AIAdaptor[]>;
  /** The identity of every built-in extension (from the validated on-disk catalog). The renderer pairs
   *  each with its lazily-loaded surface components + icon; enabled/disabled state comes from prefs. */
  listExtensionManifests(): Promise<ExtensionManifestWire[]>;
  /** Subscribe to "open this extension panel" requests; returns an unsubscribe fn. */
  onOpenExtension(callback: (id: ExtensionId) => void): () => void;
  /** Pop the native right-click menu for a toolbar extension icon (Settings page / Remove), acted on in
   *  the main process; the chosen action is pushed back via `onExtensionContextMenuAction`. */
  showExtensionContextMenu(id: ExtensionId): void;
  /** Subscribe to the action chosen from an extension icon's context menu; returns an unsubscribe fn. */
  onExtensionContextMenuAction(callback: (choice: ExtensionContextMenuChoice) => void): () => void;
  // Browser downloads (tepegoz://downloads). Mutations go through id-addressed commands; paths stay in
  // main and the UI asks main to open/reveal by id.
  listDownloads(): Promise<DownloadRecord[]>;
  commandDownload(input: DownloadCommandInput): Promise<void>;
  onDownloadsState(callback: (state: DownloadsState) => void): () => void;
  // Browser uploads (tepegoz://uploads). Mutations go through id-addressed commands; paths stay in main.
  listUploads(): Promise<UploadRecord[]>;
  commandUpload(input: UploadCommandInput): Promise<void>;
  onUploadsState(callback: (state: UploadsState) => void): () => void;
  // Saved/triggered agent tasks.
  listTasks(): Promise<TaskDefinition[]>;
  getTask(id: string): Promise<TaskDefinition | null>;
  saveTask(input: TaskSaveInput): Promise<TaskDefinition>;
  deleteTask(id: string): Promise<void>;
  runTaskNow(input: TaskCommandInput): Promise<void>;
  cancelTaskRun(input: TaskCommandInput): Promise<void>;
  setTaskEnabled(input: { id: string; enabled: boolean }): Promise<void>;
  listTaskRuns(taskId?: string): Promise<TaskRunRecord[]>;
  listTaskArtifacts(taskId?: string): Promise<TaskArtifactRecord[]>;
  onTasksState(callback: (state: TasksState) => void): () => void;
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
  // Browsing history (tepegoz://history).
  getHistory(params?: { limit?: number; offset?: number }): Promise<HistoryEntry[]>;
  searchHistory(params: {
    query: string;
    limit?: number;
    offset?: number;
  }): Promise<HistoryEntry[]>;
  deleteHistory(url: string): Promise<void>;
  clearHistory(): Promise<void>;
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
  // Login credential manager (logins:* channels). Encrypted on disk; raw secrets never cross IPC.
  /** All stored login metadata (no passwords). */
  listLogins(): Promise<LoginCredentialMeta[]>;
  /** Save a new or updated login. The raw password is encrypted in main immediately on arrival. */
  setLogin(credential: {
    url: string;
    username: string;
    password: string;
    title?: string;
    notes?: string;
  }): Promise<LoginCredentialMeta>;
  removeLogin(id: string): Promise<void>;
  importLogins(data: string, format: string): Promise<LoginImportResult>;
  exportLogins(format: string): Promise<string>;
  /** Subscribe to autofill-available pushes (main → renderer on page load). Returns unsubscribe fn. */
  onAutofillAvailable(callback: (payload: AutofillAvailablePayload) => void): () => void;
  /** Fill the selected credential into the active tab's page form. Main decrypts; nothing returns. */
  fillLogin(credentialId: string): void;
  // Macros (ext-macros): CRUD + CSV attach, deterministic run + record, with streamed events.
  listMacros(): Promise<MacroSummary[]>;
  getMacro(id: string): Promise<Macro | null>;
  /** Save (upsert) a macro; the IR is validated by MacroSchema in main. Returns its summary. */
  saveMacro(macro: Macro): Promise<MacroSummary>;
  deleteMacro(id: string): Promise<void>;
  /** Store CSV text as a content-addressed blob; returns the hash to reference from a `forEachRow`. */
  attachMacroCsv(content: string): Promise<string>;
  /** Start a saved-macro run; progress streams via {@link onMacroRunProgress}. Returns the runId. */
  runMacro(input: MacroRunInput): Promise<{ runId: string }>;
  /** Run an UNSAVED macro IR directly (record/edit → play without persisting). */
  runDraftMacro(input: MacroRunDraftInput): Promise<{ runId: string }>;
  cancelMacro(runId: string): void;
  /** Subscribe to run progress (started/step/done/failed). Returns an unsubscribe function. */
  onMacroRunProgress(callback: (progress: MacroRunProgress) => void): () => void;
  /** Begin recording the active tab; captured steps stream via {@link onMacroRecordStep}. */
  startMacroRecording(): Promise<void>;
  stopMacroRecording(): Promise<void>;
  /** Subscribe to captured steps while recording. Returns an unsubscribe function. */
  onMacroRecordStep(callback: (step: MacroRecordedStep) => void): () => void;
  /** Subscribe to simulated cursor-position updates during a macro/agent run. Returns unsubscribe fn.
   *  Coordinates are shell-window-relative (CSS px, position:fixed space). `visible:false` = idle. */
  onCursorPosition(callback: (pos: { x: number; y: number; visible: boolean }) => void): () => void;
  readonly platform: string;
}
