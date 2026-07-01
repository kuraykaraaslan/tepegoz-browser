/**
 * Typed IPC contract (internal-ai-rules / electron-desktop-security): the preload exposes ONLY a
 * small, named, typed API — never raw ipcRenderer. Channels are named `domain:action`.
 *
 * NOTE: this file is imported by the SANDBOXED preload, so it must stay dependency-free (no zod —
 * a sandboxed preload cannot `require` external npm modules). Runtime schemas live in `ipc-schemas.ts`
 * and `main/preferences/preferences.model.ts` (main-process only).
 */
export const IpcChannels = {
  appGetInfo: 'app:get-info',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  credentialsStatus: 'credentials:status',
  credentialsSet: 'credentials:set',
  credentialsRemove: 'credentials:remove',
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  tabsCreate: 'tabs:create',
  tabsClose: 'tabs:close',
  tabsActivate: 'tabs:activate',
  tabsNavigate: 'tabs:navigate',
  tabsGoBack: 'tabs:go-back',
  tabsGoForward: 'tabs:go-forward',
  tabsReload: 'tabs:reload',
  tabsContextMenu: 'tabs:context-menu',
  tabsSetBounds: 'tabs:set-bounds',
  tabsSetContentVisible: 'tabs:set-content-visible',
  tabsGetState: 'tabs:get-state',
  tabsState: 'tabs:state',
  agentRun: 'agent:run',
  agentCancel: 'agent:cancel',
  agentEvent: 'agent:event',
  agentApprovalRequest: 'agent:approval-request',
  agentApprovalResponse: 'agent:approval-response',
  agentPlanPreview: 'agent:plan-preview',
  agentPlanResponse: 'agent:plan-response',
  tokenUsage: 'token:usage',
  tokenUsageGet: 'token:usage-get',
  menuShowMain: 'menu:show-main',
  menuAction: 'menu:action',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export type ThemePref = 'system' | 'light' | 'dark';
export type LocalePref = 'system' | 'en' | 'tr';
export type ProviderId = 'anthropic' | 'openai' | 'gemini';

export interface Preferences {
  theme: ThemePref;
  locale: LocalePref;
  telemetryEnabled: boolean;
  /** Cost-saver: route simple capabilities to the local SLM (real routing lands in Phase 1b). */
  useLocalModelForSimpleTasks: boolean;
  defaultProvider: ProviderId;
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

/** Live Agent Console event kinds (observability-first: every step is surfaced). */
export type AgentEventKind =
  | 'plan'
  | 'step_start'
  | 'step_ok'
  | 'step_error'
  | 'awaiting_approval'
  | 'done'
  | 'error';

export interface AgentEvent {
  runId: string;
  kind: AgentEventKind;
  message: string;
  /** Extra context (tool name, reason code, URL, plan summary). */
  detail?: string;
  ts: number;
}

/** HITL prompt raised when the Policy Kernel says "ask" — shown as a blocking modal. */
export interface AgentApprovalRequest {
  runId: string;
  approvalId: string;
  toolName: string;
  /** Stable reason code (Permission Debug). */
  reason: string;
  /** HIGH-RISK actions require biometric (Windows Hello) — surfaced in the modal. */
  biometric: boolean;
  /** Truncated, safe preview of the tool arguments. */
  argsPreview: string;
}

export interface AgentRunResult {
  runId: string;
  stoppedReason: string;
  ok: boolean;
}

/** One step of a proposed plan, shown in the editable plan-preview (HITL before the agent loop). */
export interface AgentPlanStep {
  id: string;
  tool: string;
  rationale: string;
}

/** The full plan proposed to the user for review BEFORE any step executes. */
export interface AgentPlanPreview {
  runId: string;
  planId: string;
  goal: string;
  steps: AgentPlanStep[];
}

/** Token-usage snapshot for the quota indicator (aggregated by the Token Ledger). */
export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Actions the native main menu asks the chrome renderer to perform (UI state it owns). */
export type MenuAction = 'open-settings' | 'open-agent';

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
  /** Report the content-area rect so main can lay out the active web view below the chrome. */
  setContentBounds(bounds: ContentBounds): void;
  /** Hide/show the web view so a chrome overlay (e.g. Settings) can take the content area. */
  setContentVisible(visible: boolean): void;
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
  /** Pop the native main (hamburger) menu, anchored to the sender window. */
  showMainMenu(): void;
  /** Subscribe to main-menu actions the renderer must perform; returns an unsubscribe function. */
  onMenuAction(callback: (action: MenuAction) => void): () => void;
  readonly platform: string;
}
