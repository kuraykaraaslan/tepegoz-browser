/**
 * Built-in extensions + connections slice of {@link TepegozApi} — user-agent switcher, popup blocker,
 * adblock, typo, translate, MCP/adaptors, extension manifests, plus downloads/uploads/tasks. Type-only
 * imports keep this dependency-free for the sandboxed preload; composed into the full surface by `api.ts`.
 */
import type { PopupBlockerRequest, PopupBlockerSettings } from './contract';
import type {
  TypoCheckInput,
  TypoCheckResult,
  TypoDictionaryInfo,
  TypoSettings,
  TypoState,
} from './contract';
import type { AdblockSettings, AdblockState } from './contract';
import type {
  TranslateCloudFallbackRequest,
  TranslateCloudFallbackResponse,
  TranslateGlossaryTerm,
  TranslatePageState,
  TranslateSettings,
  TranslateState,
  TranslateTextInput,
  TranslateTextResult,
  VideoPlayerPageState,
  VideoPlayerSettings,
  VideoPlayerState,
} from './contract';
import type { AdaptorConnection } from './contract';
import type { ExtensionId, ExtensionManifestWire, ExtensionContextMenuChoice } from './contract';
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
import type { McpServerStatusInfo } from './preferences-types';
import type { AIAdaptor } from './ai-adaptor-types';

export interface ExtensionsApi {
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
  // Typo extension: local-first writing checks and downloadable dictionaries.
  getTypoSettings(): Promise<TypoSettings>;
  setTypoSettings(patch: Partial<TypoSettings>): Promise<TypoSettings>;
  getTypoState(): Promise<TypoState>;
  checkTypoText(input: TypoCheckInput): Promise<TypoCheckResult>;
  listTypoDictionaries(): Promise<TypoDictionaryInfo[]>;
  downloadTypoDictionary(id: string): Promise<void>;
  cancelTypoDictionaryDownload(id: string): void;
  deleteTypoDictionary(id: string): Promise<void>;
  showTypoDictionariesFolder(): Promise<void>;
  setTypoSiteEnabled(origin: string, enabled: boolean): Promise<TypoSettings>;
  addTypoIgnoredWord(word: string, language: string): Promise<TypoSettings>;
  onTypoDictionariesState(callback: (items: TypoDictionaryInfo[]) => void): () => void;
  // Translate extension: full-page and selection translation.
  getTranslateSettings(): Promise<TranslateSettings>;
  setTranslateSettings(patch: Partial<TranslateSettings>): Promise<TranslateSettings>;
  getTranslateState(): Promise<TranslateState>;
  translateText(input: TranslateTextInput): Promise<TranslateTextResult>;
  startPageTranslation(): Promise<TranslatePageState | null>;
  restorePageOriginal(): Promise<TranslatePageState | null>;
  setTranslateSiteEnabled(origin: string, enabled: boolean): Promise<TranslateSettings>;
  addTranslateGlossaryTerm(term: Omit<TranslateGlossaryTerm, 'id'>): Promise<TranslateSettings>;
  removeTranslateGlossaryTerm(id: string): Promise<TranslateSettings>;
  onTranslatePageState(callback: (state: TranslatePageState | null) => void): () => void;
  onTranslateCloudFallbackRequest(
    callback: (request: TranslateCloudFallbackRequest) => void,
  ): () => void;
  respondTranslateCloudFallback(response: TranslateCloudFallbackResponse): void;
  // Unified Player (ext-video-player): settings, combined settings+page snapshot, per-site pause, and a
  // live push of how many videos were skinned on the active tab.
  getVideoPlayerSettings(): Promise<VideoPlayerSettings>;
  setVideoPlayerSettings(patch: Partial<VideoPlayerSettings>): Promise<VideoPlayerSettings>;
  getVideoPlayerState(): Promise<VideoPlayerState>;
  setVideoPlayerSiteEnabled(origin: string, enabled: boolean): Promise<VideoPlayerSettings>;
  onVideoPlayerPageState(callback: (state: VideoPlayerPageState | null) => void): () => void;
  /** Read-only status of every configured MCP server (Settings → Connections). Never returns secrets. */
  getMcpStatus(): Promise<McpServerStatusInfo[]>;
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
  /** Ask main to relay an "open this extension" request to the owning chrome window. Used by the
   *  Extensions panel popup, which runs in its own window and cannot reach the chrome's surface state. */
  requestOpenExtension(id: ExtensionId): void;
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
}
