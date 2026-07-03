/**
 * Typed IPC contract (internal-ai-rules / electron-desktop-security): the preload exposes ONLY a
 * small, named, typed API — never raw ipcRenderer. Channels are named `domain:action`.
 *
 * NOTE: this file is imported by the SANDBOXED preload, so it must stay dependency-free (no zod —
 * a sandboxed preload cannot `require` external npm modules). Runtime schemas live in `ipc-schemas.ts`
 * and `main/preferences/preferences.model.ts` (main-process only).
 *
 * Agent wire types come from the isolated Agent extension package (its public contract). Type-only,
 * so the sandboxed preload stays dependency-free.
 */
import type {
  AgentApprovalRequest,
  AgentEvent,
  AgentEventKind,
  AgentPlanPreview,
  AgentPlanStep,
  AgentRunResult,
  TokenUsageSnapshot,
} from '@tepegoz/ext-agent/types';

export type {
  AgentApprovalRequest,
  AgentEvent,
  AgentEventKind,
  AgentPlanPreview,
  AgentPlanStep,
  AgentRunResult,
  TokenUsageSnapshot,
};

// Browsing-history + bookmark entry types live in the persistence package (single source). Type-only
// imports → erased, so the sandboxed preload stays dependency-free.
import type { BookmarkEntry, HistoryEntry } from '@tepegoz/persistence';
export type { BookmarkEntry, HistoryEntry };

// Provider identity is owned by @tepegoz/shared-types (the single schema source): AIProviderEnum and
// this contract both derive from the SAME zod-free `providers` entry, which the sandboxed preload can
// safely import at runtime. (MCP_TRANSPORTS below still mirrors McpTransportEnum — next candidate.)
import {
  AI_PROVIDERS,
  type AIProvider as ProviderId,
  type ProviderKeyStatus,
} from '@tepegoz/shared-types/providers';
export const PROVIDER_IDS = AI_PROVIDERS;
export type { ProviderId, ProviderKeyStatus };

// Notification identity + data model is owned by @tepegoz/shared-types (zod-free, so the sandboxed
// preload can import it at runtime). The zod validators build from these same arrays (single source).
import {
  SITE_PERMISSION_STATES,
  type AppNotification,
  type NotificationAction,
  type NotificationActionType,
  type NotificationState,
  type SitePermissionState,
} from '@tepegoz/shared-types/notifications';
export { SITE_PERMISSION_STATES };
export type {
  AppNotification,
  NotificationAction,
  NotificationActionType,
  NotificationState,
  SitePermissionState,
};

// Channel names + internal page addresses live in channels.ts (250-line cap); re-exported here so
// `@tepegoz/desktop-ipc` consumers keep one import surface.
export * from './channels';

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

// Canonical value lists — the ONE place these unions are spelled out. The zod validators (schemas.ts,
// preferences.model.ts) build their z.enum from these same arrays, so schema/type drift is impossible.
// Plain `as const` arrays keep this file dependency-free for the sandboxed preload. (Provider identity
// comes from @tepegoz/shared-types/providers — see the import block above.)
export const THEME_PREFS = ['system', 'light', 'dark'] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export const LOCALE_PREFS = ['system', 'en', 'tr'] as const;
export type LocalePref = (typeof LOCALE_PREFS)[number];

export const MCP_TRANSPORTS = ['stdio', 'http_sse'] as const;
export type McpTransportId = (typeof MCP_TRANSPORTS)[number];

/**
 * A user-configured MCP server (persisted in preferences). Its tools are surfaced to the agent through
 * the single ToolGateway PEP (ADR-0018). Extensions can also declare servers in their manifest; those
 * are not stored here. In Phase 1a only `stdio` is wired; `http_sse` is reserved.
 */
export interface McpServerPref {
  id: string;
  label: string;
  transport: McpTransportId;
  // Optional fields include `| undefined` to match the zod `.optional()` output shape under
  // exactOptionalPropertyTypes (the preferences schema `satisfies z.ZodType<Preferences>`).
  command?: string | undefined;
  args?: string[] | undefined;
  env?: Record<string, string> | undefined;
  url?: string | undefined;
  enabled: boolean;
}

/** Read-only connection status for the Settings "Connections / MCP" list (never carries secrets). */
export type McpServerState = 'idle' | 'connecting' | 'ready' | 'error';
export interface McpServerStatusInfo {
  id: string;
  label: string;
  transport: McpTransportId;
  state: McpServerState;
  toolCount: number;
  error?: string;
}

export interface Preferences {
  theme: ThemePref;
  locale: LocalePref;
  telemetryEnabled: boolean;
  /** Cost-saver: route simple capabilities to the local SLM (real routing lands in Phase 1b). */
  useLocalModelForSimpleTasks: boolean;
  defaultProvider: ProviderId;
  /** Per-extension status (managed at tepegoz://extensions). Unlisted extensions default to enabled. */
  extensions: ExtensionState[];
  /** Active User-Agent override for browsed pages (User-Agent switcher extension); null = default. */
  userAgent: string | null;
  /** External MCP servers whose tools the agent may use (routed through the ToolGateway PEP). */
  mcpServers: McpServerPref[];
  /** Master switch for native OS + in-app notifications (Settings → Notifications). */
  notificationsEnabled: boolean;
  /** Per-origin web-capability permissions (currently the Web Notification API consent state). */
  sitePermissions: Record<string, SitePermissions>;
}

/** Per-origin web-capability grants. Keyed by origin in `Preferences.sitePermissions`. */
export interface SitePermissions {
  notifications?: SitePermissionState | undefined;
}

/** Main → renderer: a site asked for a web capability; the renderer shows the consent prompt. */
export interface NotificationPermissionRequest {
  requestId: string;
  origin: string;
}

/** Renderer → main: the user's consent answer. `remember` persists it to `sitePermissions`. */
export interface NotificationPermissionResponse {
  requestId: string;
  allow: boolean;
  remember: boolean;
}

export interface CredentialsStatus {
  /** Whether the OS keychain (safeStorage) can encrypt on this device. */
  encryptionAvailable: boolean;
  providers: ProviderKeyStatus;
}

/** One of the fixed Chrome-style tab-group colors (ADR-0020). */
export type TabGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

/** A tab group: purely organizational metadata (ADR-0020), never a session/policy partition. */
export interface TabGroupInfo {
  id: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
}

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  isLoading: boolean;
  /** Page favicon URL (http(s)/data:), or null when the page has none yet. */
  faviconUrl: string | null;
  /** Pinned tabs form a run at the front of the strip and cannot belong to a group (ADR-0020). */
  pinned: boolean;
  /** Owning group id, or null when ungrouped. Mutually exclusive with `pinned`. */
  groupId: string | null;
  /** True while the page is producing audio. */
  audible?: boolean;
  /** True when the user has muted this tab's audio. */
  muted?: boolean;
  /** True when the tab's view has been discarded (sleeping) and will reload on next activation. */
  discarded?: boolean;
}

export interface TabsState {
  tabs: TabInfo[];
  /** Groups in strip order (each group's member tabs are contiguous in `tabs`). */
  groups: TabGroupInfo[];
  activeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
}

/**
 * Internal "extensions" — built-in feature panels registered under one uniform model (the foundation
 * for the extension system; real MV3/third-party extensions remain a later phase). Each opens as a
 * chrome-rendered panel over the content area. The Agent is the first; add ids here as more land.
 */
/** Reverse-DNS extension id (e.g. "com.tepegoz.agent"). The built-in registry (shared/extensions.ts)
 *  is the source of truth for which ids exist — kept out of this preload-safe file (it pulls in zod). */
export type ExtensionId = string;

/** Per-extension status (managed at tepegoz://extensions). More states (e.g. 'error') may be added. */
export type ExtensionStatus = 'enabled' | 'disabled';
export interface ExtensionState {
  id: ExtensionId;
  status: ExtensionStatus;
}

/** An extension's status from the persisted list (defaults to 'enabled' when not listed). */
export function extensionStatus(
  extensions: readonly ExtensionState[],
  id: ExtensionId,
): ExtensionStatus {
  return extensions.find((e) => e.id === id)?.status ?? 'enabled';
}

export function isExtensionEnabled(
  extensions: readonly ExtensionState[],
  id: ExtensionId,
): boolean {
  return extensionStatus(extensions, id) !== 'disabled';
}

/** Content-area rectangle (DIP) where the active tab's web view is laid out, below the chrome. */
export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The wired actions of the web-page right-click menu. Placeholder rows (Cast, Lens, …) have no action.
 *  Dispatched in main against the context captured at right-click time (inspect/copy-image use its x/y,
 *  link/media actions use the captured URLs). */
export type PageMenuAction =
  | 'back'
  | 'forward'
  | 'reload'
  | 'view-source'
  | 'inspect'
  | 'print'
  | 'save'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'select-all'
  | 'search-selection'
  | 'copy-link'
  | 'open-link-new-tab'
  | 'copy-image'
  | 'copy-media-link'
  | 'save-media'
  | 'open-media-new-tab';

/** The media kind under the cursor (from Electron's `context-menu` params). `none` = not media. */
export type PageMenuMediaType = 'none' | 'image' | 'audio' | 'video' | 'canvas' | 'file' | 'plugin';

/** Snapshot the page context menu reads to pick its variant + enable rows (captured at right-click). */
export interface PageMenuContext {
  canGoBack: boolean;
  canGoForward: boolean;
  pageUrl: string;
  /** Selected text (trimmed, truncated for display), or '' if none. */
  selectionText: string;
  /** The link href under the cursor, or '' if not on a link. */
  linkUrl: string;
  /** The media/source URL under the cursor, or '' if not on media. */
  srcUrl: string;
  mediaType: PageMenuMediaType;
  /** True when the cursor is in an editable field (input/textarea/contenteditable). */
  isEditable: boolean;
  canCopy: boolean;
  canCut: boolean;
  canPaste: boolean;
  canSelectAll: boolean;
}

/** The exact surface bridged to `window.tepegoz` in the renderer. */
export interface TepegozApi {
  getAppInfo(): Promise<AppInfo>;
  getPreferences(): Promise<Preferences>;
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>;
  /** Reset all preferences to defaults. Encrypted credentials (the vault) are NOT affected. */
  resetPreferences(): Promise<Preferences>;
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
  updateTabGroup(groupId: string, patch: { name?: string; color?: TabGroupColor; collapsed?: boolean }): void;
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
  // Agent (Do mode): run a task, stream live events, answer HITL approvals.
  /** Start an agentic task on the active tab; resolves when the run finishes. */
  runAgent(prompt: string): Promise<AgentRunResult>;
  /** Cancel an in-flight run. */
  cancelAgent(runId: string): void;
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
  // User-Agent switcher extension: read/apply the UA override for browsed pages.
  /** The currently applied UA override (or null for the browser default). */
  getUserAgent(): Promise<string | null>;
  /** Apply a UA string for browsed pages, or null to reset to the default. Returns the stored value. */
  setUserAgent(ua: string | null): Promise<string | null>;
  /** Read-only status of every configured MCP server (Settings → Connections). Never returns secrets. */
  getMcpStatus(): Promise<McpServerStatusInfo[]>;
  /** Subscribe to "open this extension panel" requests; returns an unsubscribe fn. */
  onOpenExtension(callback: (id: ExtensionId) => void): () => void;
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
  // Browsing history (tepegoz://history). All return the fresh list so the page re-renders.
  getHistory(): Promise<HistoryEntry[]>;
  searchHistory(query: string): Promise<HistoryEntry[]>;
  deleteHistory(url: string): Promise<HistoryEntry[]>;
  clearHistory(): Promise<HistoryEntry[]>;
  // Bookmarks. Only http(s) pages are bookmarkable (internal tepegoz:// pages are rejected in main).
  /** All bookmarks, newest-first. */
  listBookmarks(): Promise<BookmarkEntry[]>;
  /** Add the page if absent, else remove it. Returns the resulting bookmarked state. */
  toggleBookmark(url: string, title: string): Promise<boolean>;
  /** Whether a URL is currently bookmarked (drives the star's filled/outline state). */
  isBookmarked(url: string): Promise<boolean>;
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
  readonly platform: string;
}
