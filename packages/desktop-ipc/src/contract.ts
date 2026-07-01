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
// Plain `as const` arrays keep this file dependency-free for the sandboxed preload. PROVIDER_IDS
// mirrors `AIProviderEnum` in @tepegoz/shared-types (this package can't depend on it yet — the enum
// unification across that boundary is tracked as a follow-up).
export const THEME_PREFS = ['system', 'light', 'dark'] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export const LOCALE_PREFS = ['system', 'en', 'tr'] as const;
export type LocalePref = (typeof LOCALE_PREFS)[number];
export const PROVIDER_IDS = ['anthropic', 'openai', 'gemini'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

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
}

/** Per-provider "is a key stored" flags — NEVER the keys themselves. */
export type ProviderKeyStatus = Record<ProviderId, boolean>;

export interface CredentialsStatus {
  /** Whether the OS keychain (safeStorage) can encrypt on this device. */
  encryptionAvailable: boolean;
  providers: ProviderKeyStatus;
}

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  isLoading: boolean;
  /** Page favicon URL (http(s)/data:), or null when the page has none yet. */
  faviconUrl: string | null;
}

export interface TabsState {
  tabs: TabInfo[];
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

/** The exact surface bridged to `window.tepegoz` in the renderer. */
export interface TepegozApi {
  getAppInfo(): Promise<AppInfo>;
  getPreferences(): Promise<Preferences>;
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>;
  getCredentialsStatus(): Promise<CredentialsStatus>;
  /** Renderer → main only (user-entered key). The raw key never flows back to the renderer. */
  setProviderKey(provider: ProviderId, apiKey: string): Promise<CredentialsStatus>;
  removeProviderKey(provider: ProviderId): Promise<CredentialsStatus>;
  // Custom window chrome (frameless): caption controls.
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  isWindowMaximized(): Promise<boolean>;
  /** Subscribe to maximize/restore state changes; returns an unsubscribe function. */
  onWindowMaximizedChange(callback: (maximized: boolean) => void): () => void;
  // Browser tabs (each is an isolated WebContentsView in the main process).
  createTab(url?: string): void;
  closeTab(id: string): void;
  activateTab(id: string): void;
  /** Pop the native right-click menu for a tab (Chrome-style), acted on in the main process. */
  showTabContextMenu(id: string): void;
  /** Navigate the ACTIVE tab (omnibox). */
  navigateTab(input: string): void;
  tabGoBack(): void;
  tabGoForward(): void;
  tabReload(): void;
  /** Reopen the most-recently-closed tab (Ctrl+Shift+T). */
  reopenClosedTab(): void;
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
  /** Pop the native main (hamburger) menu, anchored to the sender window. */
  showMainMenu(): void;
  /** Subscribe to "open this extension panel" requests from the menu; returns an unsubscribe fn. */
  onOpenExtension(callback: (id: ExtensionId) => void): () => void;
  /** Open an extension's `popup` surface as a native floating window anchored at `anchor` (the toolbar
   *  icon's rect, in window-content DIP). Floats above the page, which stays live behind it. */
  openExtensionPopup(id: ExtensionId, anchor: ContentBounds): void;
  /** Close the open extension popup (also auto-closes when it loses focus). */
  closeExtensionPopup(): void;
  /** Subscribe to popup-closed notifications (e.g. dismissed by click-away); returns an unsubscribe fn. */
  onExtensionPopupClosed(callback: () => void): () => void;
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
  readonly platform: string;
}
