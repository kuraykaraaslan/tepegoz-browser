/**
 * Agent (Do mode) slice of {@link TepegozApi} — runs, conversations, HITL, config, token usage, and
 * on-device model management. Type-only imports keep this dependency-free for the sandboxed preload;
 * composed into the full surface by `api.ts`.
 */
import type {
  AgentApprovalRequest,
  AgentAutonomy,
  AgentBundleExportInput,
  AgentConfig,
  AgentEffort,
  AgentDelta,
  AgentEvent,
  AgentFileAttachment,
  AgentPlanPreview,
  AgentRunResult,
  ProviderId,
  TokenUsageSnapshot,
} from './contract';
import type {
  AgentConversationDetail,
  AgentConversationListInput,
  AgentConversationOpenInput,
  AgentConversationSummary,
  AgentConversationsState,
} from './contract';
import type { SkillRecord } from './contract';
import type { LocalModelInfo } from './preferences-types';

export interface AgentApi {
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
    /** The skill this run came from, when it started from one (S9). */
    skillId?: string;
    attachmentMeta?: {
      kind: 'selection' | 'file' | 'screenshot';
      label: string;
      mimeType?: string;
      sizeBytes?: number;
    }[];
  }): Promise<AgentRunResult>;
  /** Cancel an in-flight run. */
  cancelAgent(runId: string): void;
  /** Hold a running agent between steps (not cancel); resume continues it. */
  pauseAgent(runId: string): void;
  resumeAgent(runId: string): void;
  /** Inject a steering message into a RUNNING agent — it folds into the current run, not a new one. */
  steerAgent(runId: string, text: string): void;
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
  // Skills library (S9). A skill is a stored prompt TEMPLATE; selecting one pre-fills the composer and
  // never starts a run, so the send gesture that authorises a task stays with the human.
  /**
   * Park the window off-screen and let the run continue (S8). The tray keeps showing that the agent
   * is working; the run itself is untouched — this moves the window, not the task.
   */
  continueAgentInBackground(): Promise<void>;
  listAgentSkills(): Promise<SkillRecord[]>;
  /** Create (omit `id`) or update a skill. The main process mints the UUID — never the renderer. */
  saveAgentSkill(input: {
    id?: string;
    name: string;
    prompt: string;
    startUrl?: string;
    grantProfile?: string;
  }): Promise<SkillRecord[]>;
  /** Soft-delete a skill; resolves with the remaining list. */
  deleteAgentSkill(id: string): Promise<SkillRecord[]>;
  /** Subscribe to the live Agent Console event stream; returns an unsubscribe function. */
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  /** Streamed model fragments for the running task — ephemeral, never journaled (ADR-0025). */
  onAgentDelta(callback: (delta: AgentDelta) => void): () => void;
  /** Subscribe to HITL approval prompts; returns an unsubscribe function. */
  onAgentApprovalRequest(callback: (request: AgentApprovalRequest) => void): () => void;
  /** Answer a HITL prompt (approve/deny a gated tool call). */
  respondAgentApproval(
    approvalId: string,
    approved: boolean,
    remember?: boolean,
    grantScope?: boolean,
  ): void;
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
  /** Agent panel: set the per-run provider override (provider selector). */
  setAgentProvider(provider: ProviderId): Promise<void>;
  /** Agent panel: pin a specific model for `provider` (Model dropdown); `''` clears it (auto/tiered). */
  setAgentModel(provider: ProviderId, model: string): Promise<void>;
  /** Agent panel: set the autonomy level (mode dropdown). */
  setAgentAutonomy(level: AgentAutonomy): Promise<void>;
  /** Agent panel: set the reasoning-effort preset (effort dropdown). */
  setAgentEffort(level: AgentEffort): Promise<void>;
  /** Agent panel: toggle the hardened inbound guard (PII redaction on page reads). */
  setAgentStrictGuard(on: boolean): Promise<void>;
  /** Open a file the agent produced, gated to the whitelisted folders (fire-and-forget). */
  openAgentFile(path: string): void;
  /** Write the current chat log to the ~/tepegoz folder and reveal it. Resolves to the absolute path. */
  exportChatLog(input: { content: string; title?: string }): Promise<string>;
  /** Write a full diagnostic bundle (chat + per-tab DOM/PNG snapshots + memory + journal + manifest) to a
   *  `~/tepegoz/ai_agent_export_<stamp>/` folder and reveal it. Resolves to the absolute folder path. */
  exportAgentBundle(input: AgentBundleExportInput): Promise<string>;
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
}
