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
  AgentAutonomy,
  AgentConfig,
  AgentEffort,
  AgentEvent,
  AgentEventKind,
  AgentModelChoice,
  AgentPlanPreview,
  AgentPlanStep,
  AgentRunResult,
  TokenUsageSnapshot,
} from '@tepegoz/ext-agent/types';
// Canonical effort-level list is owned by the agent package (zod-free); re-exported so the preferences
// schema builds its z.enum from the same source (no drift), like the other canonical arrays below.
import { AGENT_EFFORT_LEVELS } from '@tepegoz/ext-agent/types';
export { AGENT_EFFORT_LEVELS };

export type {
  AgentApprovalRequest,
  AgentAutonomy,
  AgentConfig,
  AgentEffort,
  AgentEvent,
  AgentEventKind,
  AgentModelChoice,
  AgentPlanPreview,
  AgentPlanStep,
  AgentRunResult,
  TokenUsageSnapshot,
};

// Popup Blocker settings shape is owned by the extension package (like the Agent wire types above),
// so the extension stays the single source of truth. Type-only → erased for the sandboxed preload.
import type { PopupBlockerRequest, PopupBlockerSettings } from '@tepegoz/ext-popup-blocker/types';
export type { PopupBlockerRequest, PopupBlockerSettings };

// History lives in persistence; bookmarks moved to their own feature package. Both are the single
// source for their entry type. Type-only imports → erased, so the sandboxed preload stays dependency-free.
import type { HistoryEntry } from '@tepegoz/persistence';
import type {
  BookmarkEntry,
  BookmarkNode,
  BookmarkNodeType,
  BookmarkTreeNode,
} from '@tepegoz/bookmarks';
export type { BookmarkEntry, BookmarkNode, BookmarkNodeType, BookmarkTreeNode, HistoryEntry };

/** Which action a native bookmark context-menu item asks the renderer to perform (main→renderer). */
export interface BookmarkMenuAction {
  action:
    | 'open'
    | 'open-new-tab'
    | 'open-all'
    | 'rename'
    | 'add-folder'
    | 'delete'
    | 'open-manager'
    | 'move-to-bar';
  /** The clicked node's id. */
  id: string;
  type: BookmarkNodeType;
}

// Extension manifest identity comes from the SDK schema (single source). Type-only → erased, so the
// sandboxed preload stays dependency-free (the SDK pulls in zod). See `ExtensionManifestWire` below.
import type { ExtensionManifest } from '@tepegoz/extension-sdk';

// User-added search engines are owned by @tepegoz/shared-types (zod-free, preload-safe). Type-only →
// erased. Persisted in `Preferences.customSearchEngines` and merged with the built-in list.
import type { SearchEngine } from '@tepegoz/shared-types/search-engines';
export type { SearchEngine };

// File-access grant model is owned by @tepegoz/shared-types (zod-free `file-access` entry, preload-safe).
// The zod validator (preferences.model.ts) builds from the same FILE_ACCESS_MODES list (single source).
import {
  FILE_ACCESS_MODES,
  type FileAccessGrant,
  type FileAccessMode,
} from '@tepegoz/shared-types/file-access';
export { FILE_ACCESS_MODES };
export type { FileAccessGrant, FileAccessMode };

// Tool/action metadata types (zod-free type-only imports → erased, preload-safe). Used by the
// "run locally" action inventory below.
import type { AiTask, RiskLevel, ToolSource } from '@tepegoz/shared-types';
export type { AiTask, RiskLevel, ToolSource } from '@tepegoz/shared-types';

// Provider identity is owned by @tepegoz/shared-types (the single schema source): AIProviderEnum and
// this contract both derive from the SAME zod-free `providers` entry, which the sandboxed preload can
// safely import at runtime. (MCP_TRANSPORTS below still mirrors McpTransportEnum — next candidate.)
import {
  AI_PROVIDERS,
  type AIProvider as ProviderId,
  type ProviderKeyMeta,
  type ProviderKeyStatus,
} from '@tepegoz/shared-types/providers';
export const PROVIDER_IDS = AI_PROVIDERS;
export {
  RUNNABLE_AI_PROVIDERS as RUNNABLE_PROVIDER_IDS,
  isRunnableProvider,
} from '@tepegoz/shared-types/providers';
export type { ProviderId, ProviderKeyMeta, ProviderKeyStatus };

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

// Macro IR + wire DTOs are owned by @tepegoz/shared-types (zod-free `macro-ir` entry, so the sandboxed
// preload can import the types at runtime; the extension surfaces + agent capabilities share them too).
// The zod validators (MacroSchema) build from the same module.
import type {
  Macro,
  MacroRecordedStep,
  MacroRunDraftInput,
  MacroRunInput,
  MacroRunProgress,
  MacroSummary,
  Step,
} from '@tepegoz/shared-types/macro-ir';
export type {
  Macro,
  MacroRecordedStep,
  MacroRunDraftInput,
  MacroRunInput,
  MacroRunProgress,
  MacroSummary,
  Step,
};

// Channel names + internal page addresses live in channels.ts (250-line cap); re-exported here so
// `@tepegoz/desktop-ipc` consumers keep one import surface.
export * from './channels';

// The public-settings allowlist + shape (extension-facing curated preferences). Zod-free.
// `PublicSettings` is imported (below) for use in `TepegozApi`; `export *` only re-exports.
import type { PublicSettings } from './public-settings';
export * from './public-settings';

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

/**
 * The kind of an {@link AIAdaptor} (the group badge in Settings). `system` = a built-in tool group
 * (browser / file operations / journal / the extension-management host); `extension` = a user-installed
 * extension's own group; `mcp` = an external MCP server. Derived from the tool source in the main process.
 */
export const AI_ADAPTOR_KINDS = ['system', 'extension', 'mcp'] as const;
export type AIAdaptorKind = (typeof AI_ADAPTOR_KINDS)[number];

/**
 * One agent action (a single registered tool), projected from the CapabilityRegistry for the Settings
 * "run locally" list. `aiTask`/`localCapable` are resolved (defaults applied); `provenance` is the
 * contributing extension/server id; `adaptorId` is the {@link AIAdaptor} it belongs to.
 */
export interface AIAdaptorAction {
  id: string;
  description: string;
  dangerClass: RiskLevel;
  source: ToolSource;
  provenance?: string;
  /** Resolved AI-task class ('none' when mechanical). */
  aiTask: AiTask;
  /** Resolved: whether this action's AI work may run on the local model. */
  localCapable: boolean;
  /** The id of the owning {@link AIAdaptor} (its group key). */
  adaptorId: string;
}

/**
 * An **AIAdaptor** — a named, typed group of agent actions surfaced in Settings → Cost & performance.
 * System tool groups (file operations, browser, journal), each extension, and each MCP server are all
 * modeled uniformly as adaptors. Built in the main process from the single CapabilityRegistry, so the
 * list needs no maintenance as tools are added. For `system` adaptors the renderer may localize `title`
 * by `id`; for `extension`/`mcp` the `title` is already resolved (manifest name / server label).
 */
export interface AIAdaptor {
  /** Group key: a system id ('browser'|'file'|'journal'|'extensions'), an extension id, or a server id. */
  id: string;
  title: string;
  kind: AIAdaptorKind;
  description?: string;
  /** Extension/server id for `extension`/`mcp` adaptors; absent for `system`. */
  provenance?: string;
  actions: AIAdaptorAction[];
}

export interface Preferences {
  theme: ThemePref;
  /**
   * Custom single-color theme (hex, e.g. '#7c3aed'); '' = follow `theme` (system/light/dark). When
   * set, it becomes the base surface and text auto-contrasts (dark color → light text, and vice-versa).
   */
  themeColor: string;
  locale: LocalePref;
  telemetryEnabled: boolean;
  /** Cost-saver: route simple/local-eligible capabilities to the on-device model. Mirrors
   *  `localProvider.mode !== 'off'` (kept as the single public boolean the router reads as `costSaver`). */
  useLocalModelForSimpleTasks: boolean;
  /** On-device (local) provider config: how it participates + which downloaded model is selected. */
  localProvider: LocalProviderPref;
  /** Per-action "run locally" overrides, keyed by action (tool) id → run-on-device. Absent id ⇒ the
   *  action's default (derived from its `aiTask`). Only affects `localCapable` actions. */
  localActions: Record<string, boolean>;
  /** Per-run provider chosen from the Agent panel selector; `null` = no override (fall back to the
   *  default resolution: whole-agent-local, then the highest-priority stored key). Only applied when
   *  usable (a cloud provider needs a key; `'local'` needs an installed model). */
  agentProviderOverride: ProviderId | null;
  /** Agent autonomy: `'ask'` = HITL plan + per-tool approval (default, safe); `'auto'` = "act without
   *  asking" (the panel auto-approves; `deny`-class policy still hard-blocks). */
  agentAutonomy: AgentAutonomy;
  /** Agent reasoning-effort preset for a run: raises reasoning depth (Anthropic `output_config.effort`)
   *  AND the per-call max-token budget. Set from the Agent panel effort dropdown. */
  agentEffort: AgentEffort;
  /**
   * The default AI provider — DERIVED from the credential vault's key order (the provider of the
   * top/highest-priority key) and synced by main whenever keys change. There is no separate UI for it;
   * reorder the keys to change it.
   */
  defaultProvider: ProviderId;
  /** Region/country (ISO 3166 code, e.g. 'TR'); '' = follow the OS. Drives date/number formatting. */
  region: string;
  /** Date-format style (Intl `dateStyle`): 'short' | 'medium' | 'long' | 'full'. */
  dateFormat: string;
  /** The selected default search engine id (see @tepegoz/shared-types/search-engines). */
  searchEngineId: string;
  /** User-added search engines, merged with the built-in list in the picker + omnibox resolution. */
  customSearchEngines: SearchEngine[];
  /** The home / new-tab page URL (opened for a new tab, the Home button, and a blank omnibox submit). */
  homepageUrl: string;
  /** Show the bookmarks bar strip under the nav toolbar (Chrome-style; toggled from the Bookmarks menu). */
  showBookmarksBar: boolean;
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
  /** Popup Blocker (strict) extension settings. */
  popupBlocker: PopupBlockerSettings;
  /** One-time sentinel: true after the curated default trusted origins have been seeded into
   *  `popupBlocker.trustedOrigins`, so an intentionally removed default is never re-added. Not
   *  user-facing. */
  popupBlockerSeeded: boolean;
  /** Master switch for the agent's local file operations (Settings → File operations). When off, every
   *  `file_*`/`fileaccess_*` tool refuses regardless of grants. */
  fileOperationsEnabled: boolean;
  /** The folders the agent may operate in, each with a permission mode (the whitelist sandbox). Empty =
   *  no filesystem access. The main process seeds `~/tepegoz` (full) once — see `fileAccessSeeded`. */
  fileAccessGrants: FileAccessGrant[];
  /** One-time sentinel: true after the default `~/tepegoz` grant has been seeded, so an intentionally
   *  emptied list is never re-seeded. Not user-facing. */
  fileAccessSeeded: boolean;
}

/**
 * How the on-device provider participates in a run:
 *  - `'off'`     — never use the local model.
 *  - `'simple'`  — local for simple/local-eligible actions only (cloud handles plan/decide).
 *  - `'default'` — run the WHOLE agent on-device (plan + exec), fully offline.
 */
export type LocalProviderMode = 'off' | 'simple' | 'default';

/** On-device provider config (keyless — the "key" is a downloaded model selected from the catalog). */
export interface LocalProviderPref {
  mode: LocalProviderMode;
  /** Selected installed model id, or '' when none selected. */
  selectedModelId: string;
}

/** One on-device model row for the Settings model-management UI (catalog entry + live install state). */
export interface LocalModelInfo {
  id: string;
  name: string;
  /** Parameter count in billions (a size/RAM hint). */
  paramsB: number;
  ctx: number;
  recommended: boolean;
  installed: boolean;
  downloading: boolean;
  /** 0..1 download progress while `downloading`. */
  progress: number;
  selected: boolean;
}

/** Per-origin web-capability grants. Keyed by origin in `Preferences.sitePermissions`. */
export interface SitePermissions {
  notifications?: SitePermissionState | undefined;
}

/** Result of the native directory picker (Settings → File operations → Add folder). */
export interface FileAccessFolderPickResult {
  /** Absolute path(s) the user chose (canonical). Empty when cancelled. */
  paths: string[];
  cancelled: boolean;
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
  /** Per-provider "has ≥1 key" flags (kept for existing consumers; derived from `keys`). */
  providers: ProviderKeyStatus;
  /** Every stored key's metadata (NO secret; `last4` is a non-secret fingerprint). Any number per provider. */
  keys: ProviderKeyMeta[];
}

// Login credential manager — preload-safe inline types (no @tepegoz/password-core import so the
// sandboxed preload stays dependency-free). These mirror the types in password-core/src/types.ts.
export interface LoginCredentialMeta {
  id: string;
  url: string;
  username: string;
  title: string;
  notes: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface LoginImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface AutofillAvailablePayload {
  url: string;
  matches: LoginCredentialMeta[];
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

/** The renderer-facing extension manifest: IDENTITY only. Omits `mcpServer` (agent/main-only). Delivered
 *  by `listExtensionManifests`; the renderer pairs each with its lazily-loaded surface components + icon
 *  (enabled/disabled state comes separately from prefs — {@link ExtensionState}). */
export type ExtensionManifestWire = Omit<ExtensionManifest, 'mcpServer'>;

/** Per-extension status (managed at tepegoz://extensions). More states (e.g. 'error') may be added. */
export type ExtensionStatus = 'enabled' | 'disabled';

/** The action chosen from a toolbar extension icon's right-click menu: open its settings page, or
 *  remove (disable) it. */
export type ExtensionContextMenuAction = 'page' | 'remove';
export interface ExtensionContextMenuChoice {
  id: ExtensionId;
  action: ExtensionContextMenuAction;
}
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
  /** Reset conversation memory so the next run starts a fresh thread (panel "New task"). */
  newAgentConversation(): void;
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
  searchHistory(params: { query: string; limit?: number; offset?: number }): Promise<HistoryEntry[]>;
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
  readonly platform: string;
}
