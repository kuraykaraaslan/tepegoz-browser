export const AGENT_CONVERSATION_STATUSES = [
  'active',
  'completed',
  'error',
  'canceled',
] as const;
export type AgentConversationStatus = (typeof AGENT_CONVERSATION_STATUSES)[number];

export const AGENT_HISTORY_EVENT_KINDS = [
  'plan',
  'decision',
  'step_start',
  'step_ok',
  'step_error',
  'awaiting_approval',
  'input_action',
  'handoff',
  'done',
  'error',
] as const;
export type AgentHistoryEventKind = (typeof AGENT_HISTORY_EVENT_KINDS)[number];

export interface AgentHistoryEvent {
  runId: string;
  groupId: string;
  kind: AgentHistoryEventKind;
  message: string;
  detail?: string | undefined;
  ts: number;
}

export interface AgentAttachmentMeta {
  kind: 'selection' | 'file' | 'screenshot';
  label: string;
  mimeType?: string | undefined;
  sizeBytes?: number | undefined;
}

export interface AgentConversationSummary {
  id: string;
  groupId: string;
  title: string;
  preview: string;
  status: AgentConversationStatus;
  turnCount: number;
  startedAt: number;
  updatedAt: number;
  lastRunId?: string | undefined;
}

export interface AgentConversationTurn {
  id: string;
  conversationId: string;
  runId?: string | undefined;
  prompt: string;
  responseSummary?: string | undefined;
  status: AgentConversationStatus;
  events: AgentHistoryEvent[];
  attachments: AgentAttachmentMeta[];
  createdAt: number;
  updatedAt: number;
}

export interface AgentConversationDetail {
  summary: AgentConversationSummary;
  turns: AgentConversationTurn[];
}

export interface AgentConversationsState {
  items: AgentConversationSummary[];
}

export interface AgentConversationListInput {
  query?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface AgentConversationOpenInput {
  id: string;
  groupId: string;
}

export function emptyAgentConversationsState(): AgentConversationsState {
  return { items: [] };
}

export function summarizeConversationPrompt(prompt: string): { title: string; preview: string } {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  const title = compact.length === 0 ? 'Untitled conversation' : compact.slice(0, 80);
  return { title, preview: compact.slice(0, 180) };
}

export function terminalStatusFromEvents(
  events: readonly AgentHistoryEvent[],
): AgentConversationStatus {
  const last = [...events].reverse().find((event) => event.kind === 'done' || event.kind === 'error');
  if (last?.kind === 'error') return 'error';
  if (last?.kind === 'done') return 'completed';
  return 'active';
}
