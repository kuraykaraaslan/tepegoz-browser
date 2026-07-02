/**
 * Agent extension's host-facing contract (the "developer API" the panel is written against). The
 * host (apps/desktop, via the preload `window.tepegoz`) implements {@link AgentHostApi}; the panel
 * never reaches global bridges directly — it receives `api` as a prop. These event/DTO types are the
 * agent's public wire shapes; the app re-exports them from its IPC contract.
 */
export type AgentEventKind =
  | 'plan'
  | 'step_start'
  | 'step_ok'
  | 'step_error'
  | 'awaiting_approval'
  | 'handoff'
  | 'done'
  | 'error';

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

/** What the Agent panel needs from the host — a small, typed surface (injected, not a global). */
export interface AgentHostApi {
  runAgent(prompt: string): Promise<AgentRunResult>;
  cancelAgent(runId: string): void;
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  onAgentApprovalRequest(callback: (request: AgentApprovalRequest) => void): () => void;
  respondAgentApproval(approvalId: string, approved: boolean): void;
  onAgentPlanPreview(callback: (preview: AgentPlanPreview) => void): () => void;
  respondAgentPlan(planId: string, approved: boolean, skipStepIds?: string[]): void;
  onTokenUsage(callback: (usage: TokenUsageSnapshot) => void): () => void;
  getTokenUsage(): Promise<TokenUsageSnapshot>;
}
