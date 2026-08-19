/**
 * Wire types owned by @tepegoz/shared-types and the browser I/O feature packages (downloads, uploads,
 * tasks), re-exported by the desktop IPC contract. Type-only imports are erased; the zod-free canonical
 * arrays (FILE_ACCESS_MODES, PROVIDER_IDS, SITE_PERMISSION_STATES) are safe for the sandboxed preload.
 */
// User-added search engines are owned by @tepegoz/shared-types (zod-free, preload-safe). Type-only →
// erased. Persisted in `Preferences.customSearchEngines` and merged with the built-in list.
import type { SearchEngine } from '@tepegoz/shared-types/search-engines';
export type { SearchEngine };

import type { AdaptorConnection } from '@tepegoz/shared-types/adaptors';
export type { AdaptorConnection };

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

// A skill is a stored PROMPT TEMPLATE (name + prompt + optional start URL + expected grant profile),
// owned by @tepegoz/shared-types. Type-only, so the sandboxed preload stays zod-free.
export type { SkillRecord } from '@tepegoz/shared-types';

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
