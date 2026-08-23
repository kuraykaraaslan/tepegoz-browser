/**
 * Agent extension's host-facing contract (the "developer API" the panel is written against). The
 * host (apps/desktop, via the preload `window.tepegoz`) implements {@link AgentHostApi}; the panel
 * never reaches global bridges directly — it receives `api` as a prop. These event/DTO types are the
 * agent's public wire shapes; the app re-exports them from its IPC contract.
 */
import type { AIProvider } from '@tepegoz/shared-types/providers';
import type { CompletionOutcome, SkillRecord } from '@tepegoz/shared-types';
import type { TaskDefinition, TaskSaveInput } from '@tepegoz/tasks';
import type {
  AgentAttachmentMeta,
  AgentConversationDetail,
  AgentConversationListInput,
  AgentConversationOpenInput,
  AgentConversationSummary,
  AgentConversationsState,
} from './history';

export type {
  AgentAttachmentMeta,
  AgentConversationDetail,
  AgentConversationListInput,
  AgentConversationOpenInput,
  AgentConversationSummary,
  AgentConversationsState,
};

/**
 * An UNSETTLED fragment of model output, streamed while a step is still running (ADR-0025).
 *
 * Deliberately NOT an {@link AgentEvent}: an event is a record — journaled, persisted to conversation
 * history, replayable. A delta is none of those. Keeping it off the event union is what makes "a delta
 * is not a record" structural instead of a rule someone has to remember. It is also untrusted model
 * output, so it is rendered as plain text and carries no authority.
 */
export interface AgentDelta {
  runId: string;
  groupId: string;
  /** The fragment as produced. May be half a word or half a JSON object; nothing parses it. */
  text: string;
}

/**
 * What the panel needs of a stored skill. Derived from @tepegoz/shared-types' SkillRecord rather than
 * redeclared, so the wire shape has exactly one definition; sync-meta stays in the store where it
 * belongs and never reaches the renderer.
 */
export type AgentSkill = Pick<SkillRecord, 'id' | 'name' | 'prompt' | 'startUrl' | 'grantProfile'>;

export type AgentEventKind =
  | 'plan'
  | 'decision'
  | 'step_start'
  | 'step_ok'
  | 'step_error'
  | 'awaiting_approval'
  | 'input_action'
  | 'handoff'
  // A click/form-submit opened a new tab; the reactor followed it (or explained why it did not), or the
  // followed tab closed and the reactor returned to the tab it started from (S3 PR3).
  | 'tab_spawn'
  // A remembered grant was used or saved (S9). Its own kind because provenance for a PERSISTENT
  // permission has to survive the run: a grant that acts invisibly is one nobody knows to revoke.
  | 'grant'
  // Run-control (live, ephemeral — NOT journaled as step events; the durable record is the checkpoint):
  | 'paused'
  | 'resumed'
  | 'steered'
  | 'done'
  | 'error';

/**
 * Reasoning effort presets for a run (mirrors the model gateway's `EffortLevel`). Higher effort raises
 * the reasoning depth AND the per-call max-token budget. Persisted per-run like the provider/autonomy.
 */
export const AGENT_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AgentEffort = (typeof AGENT_EFFORT_LEVELS)[number];

export interface AgentEvent {
  runId: string;
  /** The tab-group that owns this agent session. */
  groupId: string;
  kind: AgentEventKind;
  message: string;
  detail?: string;
  ts: number;
}

export interface AgentApprovalRequest {
  runId: string;
  /** The tab-group that owns this agent session. */
  groupId: string;
  approvalId: string;
  toolName: string;
  reason: string;
  biometric: boolean;
  argsPreview: string;
  /**
   * The risk class main derived for THIS call from the tool AND its arguments — so the prompt can say
   * what kind of act is being asked for ("this would enter a password") instead of a flat "a tool wants
   * to change state", which is what trains a user to click through. Display only: the decision was
   * already made in main. Optional so an approval raised before classification still renders.
   */
  riskTier?: RiskTier;
  /**
   * The skill this run is bound to, present ONLY when a grant for it would actually be honoured
   * (main decides — see `mayOfferRemember`). Its absence is why the checkbox does not appear for an
   * ad-hoc task, a credential/financial/destructive act, or a tainted call: offering a choice the
   * system would refuse teaches the user that their choices are decorative.
   */
  rememberSkill?: string;
  /** How long such a grant would last, so the modal can state the horizon it is asking for. */
  rememberDays?: number;
  /**
   * The site a one-tap run-scoped grant would cover, present only when main would honour one. Its
   * absence is how a tier no grant may cover (money, secrets, deletion) simply never offers the
   * control — the prompt must not offer what main would refuse.
   */
  scopeHost?: string;
}

export interface AgentPlanStep {
  id: string;
  tool: string;
  rationale: string;
}

export interface AgentPlanPreview {
  runId: string;
  /** The tab-group that owns this agent session. */
  groupId: string;
  planId: string;
  goal: string;
  steps: AgentPlanStep[];
}

export interface AgentRunResult {
  runId: string;
  stoppedReason: string;
  ok: boolean;
  /**
   * What the run’s own evidence actually supported (S4, surfaced by S8): `verified`,
   * `attempted_unverified`, or `contradicted`. Absent when the run never reached a completion
   * verdict.
   *
   * This is the difference between "the agent says it worked" and "the agent showed that it worked",
   * and it is the user’s to see. Reporting only `ok` shows them the first and calls it the second.
   */
  completionOutcome?: CompletionOutcome;
}

export interface TokenUsageSnapshot {
  /** Tokens for the CURRENT run (the in-memory ledger — resets each task). */
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Account-wide total-token quota (0 = unlimited/off). Drives the quota indicator + 80% warning. */
  quota: number;
  /** Persisted lifetime tokens used against the quota (non-refunded), across every run/restart. */
  lifetimeTokens: number;
}

/**
 * Agent autonomy level (graduated) — **re-exported, not defined here.** The canonical definition lives
 * in `@tepegoz/shared-types` because it is a security-relevant setting acted on by the main process;
 * a UI package must not own it. See `resolveAutonomy` in `@tepegoz/security-policy` for the decision
 * this level feeds, which runs in main and never in this renderer.
 */
import type { AgentAutonomy, RiskTier } from '@tepegoz/shared-types';
export type { AgentAutonomy, RiskTier };

/** One user-selectable model within a provider (the panel's Model dropdown). */
export interface AgentModelInfo {
  /** Canonical model id sent to the provider (e.g. "claude-sonnet-4-6"). */
  id: string;
  /** Friendly display name, e.g. "Sonnet 4.6". */
  label: string;
}

/** The id of the on-device entry in the picker — the one run target that is NOT a stored API key
 *  (it runs a downloaded model, selected under Settings → On-device models). */
export const LOCAL_CHOICE_ID = 'local';

/**
 * One selectable RUN TARGET in the panel's picker. This is a **stored API key**, not a provider: the
 * picker mirrors Settings → Providers & API keys one-to-one, so a user with three OpenAI keys sees
 * three entries and picks the one this conversation runs on. The single exception is the on-device
 * entry ({@link LOCAL_CHOICE_ID}), which has no key.
 *
 * Listing providers instead would offer a choice the user never made (a provider with no key cannot
 * run) while hiding the one they did (which of their keys is spending).
 */
export interface AgentModelChoice {
  /** Vault key id, or {@link LOCAL_CHOICE_ID}. Identifies the entry across IPC — provider does not,
   *  since several entries can share one. */
  id: string;
  provider: AIProvider;
  /** The KEY's user-given label from Settings, e.g. "Work". For local, the selected model's id. */
  label: string;
  /** Provider display name, e.g. "Claude", "OpenAI", "On-device" — the entry's secondary line. */
  providerLabel: string;
  /** Last 4 characters of the key (non-secret fingerprint) so two keys of one provider are tellable
   *  apart. Absent for local and for legacy records that never recorded one. */
  last4?: string;
  /** Whether it's usable right now (a key whose provider the runtime can drive; local has a model). */
  available: boolean;
}

/** The panel's current agent config: which key + model the next run uses + the autonomy + effort. */
export interface AgentConfig {
  provider: AIProvider;
  /** The {@link AgentModelChoice.id} the next run resolves to — the vault key it will spend, or
   *  {@link LOCAL_CHOICE_ID}. `''` when nothing is usable yet (no key stored, no local model). */
  selectedId: string;
  choices: AgentModelChoice[];
  /** Selectable models per provider (the Model dropdown). Keyed by provider rather than carried on each
   *  choice: the catalog is a property of the PROVIDER, and two keys of one provider would duplicate it.
   *  A provider with an empty list only auto-routes (e.g. `local`, which picks its model in Settings). */
  models: Record<AIProvider, AgentModelInfo[]>;
  /** The pinned model id on the selected KEY (`''` = auto/tiered routing). */
  model: string;
  autonomy: AgentAutonomy;
  effort: AgentEffort;
  /**
   * S6 PR5: hardened inbound guard — redacts PII out of page text before it can enter model context.
   * Off by default; a browsing agent legitimately needs to read most page data.
   */
  strictGuard: boolean;
}

/** Input for the diagnostic-bundle export (the header star). The renderer supplies the rendered chat
 *  transcript + the active agent group id + display meta; the main process gathers the per-tab
 *  snapshots, model-visible memory, journal, and environment (it owns the tabs' webContents). */
export interface AgentBundleExportInput {
  /** The rendered chat-log markdown, written verbatim as `chat.md`. */
  chatContent: string;
  /** The active agent session group id — selects which tabs' snapshots + which memory to include. */
  groupId: string;
  /** Optional display context echoed into `manifest.json` (the panel already has these). */
  meta?: {
    provider?: string;
    autonomy?: string;
    effort?: string;
    tokens?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    title?: string;
  };
}

/** A file the user attached to a message via the native file picker. */
export interface AgentFileAttachment {
  name: string;
  content: string;
  mimeType: string;
  sizeBytes: number;
}

/** A composer attachment chip (selected text, file, or screenshot). */
export interface Attachment {
  id: string;
  kind: 'selection' | 'file' | 'screenshot';
  label: string;
  content: string;
}

/** What the Agent panel needs from the host — a small, typed surface (injected, not a global). */
export interface AgentHostApi {
  runAgent(input: {
    prompt: string;
    groupId: string;
    displayPrompt?: string;
    /** The skill this run came from (S9), when it started from one. */
    skillId?: string;
    attachmentMeta?: AgentAttachmentMeta[];
  }): Promise<AgentRunResult>;
  cancelAgent(runId: string): void;
  /** Hold/resume a running agent between steps (not cancel). */
  pauseAgent(runId: string): void;
  resumeAgent(runId: string): void;
  /** Inject a steering message into a RUNNING agent — folds into the current run, not a new one. */
  steerAgent(runId: string, text: string): void;
  /** The active tab's committed URL (seed a converted task's target page); null when no web tab. */
  getActiveTabUrl(): Promise<string | null>;
  /** Save (or update) a scheduled task — used by "Save as scheduled task" in the panel. */
  saveTask(input: TaskSaveInput): Promise<TaskDefinition>;
  /** Reset conversation memory for a specific tab-group (panel "New task"). */
  newAgentConversation(groupId: string): void;
  listAgentConversations(input?: AgentConversationListInput): Promise<AgentConversationSummary[]>;
  getAgentConversation(id: string): Promise<AgentConversationDetail | null>;
  getCurrentAgentConversation(groupId: string): Promise<AgentConversationDetail | null>;
  openAgentConversation(input: AgentConversationOpenInput): Promise<AgentConversationDetail | null>;
  deleteAgentConversation(id: string): Promise<void>;
  clearAgentConversations(): Promise<void>;
  /** Skills library (S9). Every call resolves with the FULL list, so the panel never guesses the
   *  post-write state — it renders what the store actually holds. */
  /** Park the window off-screen and let the run continue (S8). Moves the window, not the task. */
  continueAgentInBackground(): Promise<void>;
  listAgentSkills(): Promise<AgentSkill[]>;
  /** Create (omit `id`) or update a skill. The main process mints the UUID, never the renderer. */
  saveAgentSkill(input: {
    id?: string;
    name: string;
    prompt: string;
    startUrl?: string;
    grantProfile?: string;
  }): Promise<AgentSkill[]>;
  deleteAgentSkill(id: string): Promise<AgentSkill[]>;
  onAgentConversationsState(callback: (state: AgentConversationsState) => void): () => void;
  /** Ensure the active tab belongs to a group; creates one if needed. Returns the groupId. */
  ensureActiveGroup(): Promise<string>;
  /** Subscribe to active-tab-group changes. The callback receives the new groupId (null = no group). */
  onActiveGroupChange(callback: (groupId: string | null) => void): () => void;
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  /** Subscribe to streamed model fragments for the running task (ephemeral; see {@link AgentDelta}). */
  onAgentDelta(callback: (delta: AgentDelta) => void): () => void;
  onAgentApprovalRequest(callback: (request: AgentApprovalRequest) => void): () => void;
  respondAgentApproval(
    approvalId: string,
    approved: boolean,
    remember?: boolean,
    grantScope?: boolean,
  ): void;
  onAgentPlanPreview(callback: (preview: AgentPlanPreview) => void): () => void;
  respondAgentPlan(planId: string, approved: boolean, skipStepIds?: string[]): void;
  onTokenUsage(callback: (usage: TokenUsageSnapshot) => void): () => void;
  getTokenUsage(): Promise<TokenUsageSnapshot>;
  /** Current provider + selectable choices + autonomy level (for the header selector + mode dropdown). */
  getAgentConfig(): Promise<AgentConfig>;
  /** Select the run target by {@link AgentModelChoice.id} — a stored key, or {@link LOCAL_CHOICE_ID}.
   *  Main promotes that key to its provider's active one and switches a live run to it. */
  selectAgentChoice(id: string): Promise<void>;
  /** Pin a specific model for `provider` (Agent panel Model dropdown); `''` clears the pin (auto/tiered).
   *  Applied to ALL tiers and, if a run is active on this provider, takes effect on the next request. */
  setAgentModel(provider: AIProvider, model: string): Promise<void>;
  /** Set the autonomy level (Agent panel mode dropdown). */
  setAgentAutonomy(level: AgentAutonomy): Promise<void>;
  /** Set the reasoning effort preset (Agent panel effort dropdown). */
  setAgentEffort(level: AgentEffort): Promise<void>;
  /** S6: toggle the hardened inbound guard. Display-only here — main decides and applies it. */
  setAgentStrictGuard(on: boolean): Promise<void>;
  /** Open a file the agent produced (gated to the whitelisted folders in the main process). */
  openAgentFile(path: string): void;
  /** Write the current chat log to the ~/tepegoz folder and reveal it. Resolves to the absolute path. */
  exportChatLog(input: { content: string; title?: string }): Promise<string>;
  /** Write a full diagnostic bundle (chat + per-tab DOM/PNG snapshots + memory + journal + manifest) to a
   *  `~/tepegoz/ai_agent_export_<stamp>/` folder and reveal it. Resolves to the absolute folder path. */
  exportAgentBundle(input: AgentBundleExportInput): Promise<string>;
  /** Open a URL from agent output in a new browser tab. */
  createTab(url?: string): void;
  /** Capture the active page's current text selection. Returns empty string if nothing is selected. */
  capturePageSelection(): Promise<string>;
  /** Open a native file picker and return the selected files' content. */
  pickAgentFiles(): Promise<AgentFileAttachment[]>;
  /** Capture a screenshot of the active tab as a base64-encoded PNG data URL. */
  capturePageScreenshot(): Promise<string | null>;
}
