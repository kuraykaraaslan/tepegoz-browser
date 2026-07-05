/**
 * Agent extension's host-facing contract (the "developer API" the panel is written against). The
 * host (apps/desktop, via the preload `window.tepegoz`) implements {@link AgentHostApi}; the panel
 * never reaches global bridges directly — it receives `api` as a prop. These event/DTO types are the
 * agent's public wire shapes; the app re-exports them from its IPC contract.
 */
import type { AIProvider } from '@tepegoz/shared-types/providers';

export type AgentEventKind =
  | 'plan'
  | 'decision'
  | 'step_start'
  | 'step_ok'
  | 'step_error'
  | 'awaiting_approval'
  | 'handoff'
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
  kind: AgentEventKind;
  message: string;
  detail?: string;
  ts: number;
}

export interface AgentApprovalRequest {
  runId: string;
  approvalId: string;
  toolName: string;
  reason: string;
  biometric: boolean;
  argsPreview: string;
}

export interface AgentPlanStep {
  id: string;
  tool: string;
  rationale: string;
}

export interface AgentPlanPreview {
  runId: string;
  planId: string;
  goal: string;
  steps: AgentPlanStep[];
}

export interface AgentRunResult {
  runId: string;
  stoppedReason: string;
  ok: boolean;
}

export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Agent autonomy level (graduated). `ask` = review the plan + every state-changing tool (default,
 * safe). `act` = auto-approve the plan + routine page changes, but STILL pause for destructive/financial
 * actions. `auto` = fully hands-off (auto-approve everything). At every level the `deny`-class
 * (sensitive-site lockout) still hard-blocks in the main process.
 */
export type AgentAutonomy = 'ask' | 'act' | 'auto';

/** One selectable provider/model for the panel's model picker. */
export interface AgentModelChoice {
  provider: AIProvider;
  /** Human label, e.g. "Claude", "OpenAI", "Local: <model>". */
  label: string;
  /** Whether it's usable right now (a cloud provider has a key; local has a selected model). */
  available: boolean;
}

/** The panel's current agent config: which provider the next run uses + the autonomy + effort level. */
export interface AgentConfig {
  provider: AIProvider;
  choices: AgentModelChoice[];
  autonomy: AgentAutonomy;
  effort: AgentEffort;
}

/** What the Agent panel needs from the host — a small, typed surface (injected, not a global). */
export interface AgentHostApi {
  runAgent(prompt: string): Promise<AgentRunResult>;
  cancelAgent(runId: string): void;
  /** Reset conversation memory so the next run starts a fresh thread (panel "New task"). */
  newAgentConversation(): void;
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  onAgentApprovalRequest(callback: (request: AgentApprovalRequest) => void): () => void;
  respondAgentApproval(approvalId: string, approved: boolean): void;
  onAgentPlanPreview(callback: (preview: AgentPlanPreview) => void): () => void;
  respondAgentPlan(planId: string, approved: boolean, skipStepIds?: string[]): void;
  onTokenUsage(callback: (usage: TokenUsageSnapshot) => void): () => void;
  getTokenUsage(): Promise<TokenUsageSnapshot>;
  /** Current provider + selectable choices + autonomy level (for the header selector + mode dropdown). */
  getAgentConfig(): Promise<AgentConfig>;
  /** Set the per-run provider override (Agent panel model selector). */
  setAgentProvider(provider: AIProvider): Promise<void>;
  /** Set the autonomy level (Agent panel mode dropdown). */
  setAgentAutonomy(level: AgentAutonomy): Promise<void>;
  /** Set the reasoning effort preset (Agent panel effort dropdown). */
  setAgentEffort(level: AgentEffort): Promise<void>;
  /** Open a file the agent produced (gated to the whitelisted folders in the main process). */
  openAgentFile(path: string): void;
  /** Open a URL from agent output in a new browser tab. */
  createTab(url?: string): void;
}
