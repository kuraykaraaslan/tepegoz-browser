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
  AgentFileAttachment,
  AgentModelChoice,
  AgentPlanPreview,
  AgentPlanStep,
  AgentRunResult,
  Attachment,
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
  AgentFileAttachment,
  AgentModelChoice,
  AgentPlanPreview,
  AgentPlanStep,
  AgentRunResult,
  Attachment,
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

// Tool/action metadata types (zod-free type-only imports → erased, preload-safe). Re-exported for
// `@tepegoz/desktop-ipc` consumers (used by `./ai-adaptor-types`'s `AIAdaptorAction`).
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

// Browser download manager types are owned by @tepegoz/downloads (zod-free public entry; schemas stay
// in its ./schemas subpath). Type-only import keeps the sandboxed preload dependency-free.
import type {
  DownloadCommandInput,
  DownloadCreateInput,
  DownloadRecord,
  DownloadsState,
} from '@tepegoz/downloads';
export type { DownloadCommandInput, DownloadCreateInput, DownloadRecord, DownloadsState };

// Browser upload broker types are owned by @tepegoz/uploads (zod-free public entry; schemas stay in
// its ./schemas subpath). Paths and content never cross the IPC contract.
import type {
  UploadCommandInput,
  UploadCreateInput,
  UploadRecord,
  UploadsState,
} from '@tepegoz/uploads';
export type { UploadCommandInput, UploadCreateInput, UploadRecord, UploadsState };

// Saved/triggered agent task types are owned by @tepegoz/tasks (zod-free public entry; schemas stay
// in its ./schemas subpath).
import type {
  TaskArtifactRecord,
  TaskCommandInput,
  TaskDefinition,
  TaskRunRecord,
  TaskSaveInput,
  TasksState,
} from '@tepegoz/tasks';
export type {
  TaskArtifactRecord,
  TaskCommandInput,
  TaskDefinition,
  TaskRunRecord,
  TaskSaveInput,
  TasksState,
};

// Clipboard operation types are owned by @tepegoz/clipboard. The desktop IPC contract only exposes
// zod-free wire types; runtime validators are re-exported from ./schemas for main-process use.
import type {
  ClipboardOperationInput,
  ClipboardReadTextInput,
  ClipboardWriteTextInput,
} from '@tepegoz/clipboard';
export type { ClipboardOperationInput, ClipboardReadTextInput, ClipboardWriteTextInput };

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
export * from './public-settings';

// Preferences, tab/tab-group wire types, AIAdaptor wire types, and the TepegozApi surface itself are
// each split into their own file (ADR-0010's 250-line cap); re-exported here for the single import
// surface `@tepegoz/desktop-ipc` consumers already rely on.
export * from './preferences-types';
export * from './tabs-types';
export * from './ai-adaptor-types';
export * from './api';

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export type WebPermissionCapability = 'notifications' | 'clipboardRead' | 'clipboardWrite';

/** Main → renderer: a site asked for a web capability; the renderer shows the consent prompt. */
export interface WebPermissionRequest {
  requestId: string;
  origin: string;
  capability: WebPermissionCapability;
}

/** Back-compat alias for the notification prompt bridge while the UI becomes capability-aware. */
export type NotificationPermissionRequest = WebPermissionRequest;

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
