import { AGENT_AUTONOMY_LEVELS } from '@tepegoz/shared-types';
import type { CompletionOutcome } from '@tepegoz/shared-types';
import type {
  AgentApprovalRequest,
  AgentAutonomy,
  AgentConversationDetail,
  AgentEvent,
  AgentPlanPreview,
  Attachment,
  TokenUsageSnapshot,
} from './types';

export type { Attachment };

/**
 * Pure (non-JSX) types and helpers backing the Agent panel: per-turn/per-group state shapes,
 * notice-building, and attachment serialization.
 * Extracted from `panel.tsx` (ADR-0010 file-size split).
 *
 * **No approval decision lives here.** `autoApprovesTool` used to auto-answer the approval IPC from
 * this renderer-held autonomy level, which let a doctored renderer approve its own financial,
 * credential and destructive tool calls. That decision now lives behind the trust boundary in main
 * (`resolveAutonomy` in `@tepegoz/security-policy`); the constants below are for the mode dropdown's
 * labels only.
 */

export const AUTONOMY_LEVELS_ALL: readonly AgentAutonomy[] = AGENT_AUTONOMY_LEVELS;
export const AUTONOMY_DISABLED = new Set<AgentAutonomy>(['dangerous']);

/** Event kinds whose message is model prose → rendered as markdown. */
export const PROSE_KINDS = new Set<AgentEvent['kind']>(['done', 'error', 'handoff']);

/** Tool-call progress kinds collapsed into the per-turn "Progress" group. `steered` rides here so an
 *  injected mid-run instruction is visible in the transcript. (`paused`/`resumed` drive the banner, not a
 *  list row.) */
export const STEP_KINDS = new Set<AgentEvent['kind']>([
  'step_start', 'step_ok', 'step_error', 'awaiting_approval', 'input_action', 'steered', 'grant',
]);

/** Notice severities for the dynamic notices strip above the composer. */
export type NoticeSeverity = 'info' | 'warning' | 'danger';
export interface Notice {
  id: string;
  severity: NoticeSeverity;
  title: string;
  body: string;
}
export const NOTICE_STYLE: Record<NoticeSeverity, string> = {
  info: 'border-border bg-surface-raised text-text-secondary',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
};

export function buildNotices(
  autonomy: AgentAutonomy,
  risk: { actTitle: string; actBody: string; autoTitle: string; autoBody: string },
): Notice[] {
  if (autonomy === 'ask') return [];
  const auto = autonomy === 'auto';
  return [{
    id: 'autonomy',
    severity: auto ? 'danger' : 'warning',
    title: auto ? risk.autoTitle : risk.actTitle,
    body: auto ? risk.autoBody : risk.actBody,
  }];
}

/** One conversation turn: the user's message + the agent events streamed for its run. */
export interface Turn {
  id: string;
  prompt: string;
  runId: string | null;
  events: AgentEvent[];
  /**
   * What this run’s evidence supported (S4). Absent when the run never reached a completion verdict —
   * deliberately not defaulted, because "we do not know" and "we could not confirm" are different
   * things to tell someone and must not collapse into the same chip.
   */
  completionOutcome?: CompletionOutcome;
}

/** Per-group state stored in the panel (keyed by groupId). */
export interface GroupState {
  turns: Turn[];
  approval: AgentApprovalRequest | null;
  planPreview: AgentPlanPreview | null;
  running: boolean;
  /** The run is held (paused-by-user or offline) — the loop is suspended but not cancelled. */
  paused: boolean;
  runId: string | null;
  skipIds: Set<string>;
  tokens: TokenUsageSnapshot | null;
  openReasoning: Set<string>;
  openSteps: Set<string>;
  prompt: string;
  attachments: Attachment[];
  expandedFiles: Set<string>;
  /**
   * The tail of the model output currently streaming (ADR-0025). Ephemeral by construction: it lives
   * only in this renderer state, is cleared by the next settled event, and is never part of `turns` —
   * which is what gets persisted and replayed.
   */
  liveDelta: string;
  /**
   * The skill that filled this composer, if any (S9). Sent with the run so main can decide whether a
   * remembered grant applies. Advisory: main re-checks that the prompt still matches the stored
   * skill, so this field cannot be used to claim someone else's permissions.
   */
  skillId: string | null;
}

/** How much of the streaming tail to keep. A long turn would otherwise grow the indicator without end. */
const LIVE_DELTA_TAIL = 400;

/** Append a streamed fragment to the live tail, keeping only its last {@link LIVE_DELTA_TAIL} chars. */
export function appendLiveDelta(cur: GroupState, text: string): GroupState {
  const next = (cur.liveDelta + text).slice(-LIVE_DELTA_TAIL);
  return next === cur.liveDelta ? cur : { ...cur, liveDelta: next };
}

export function emptyGroupState(): GroupState {
  return {
    turns: [],
    approval: null,
    planPreview: null,
    running: false,
    paused: false,
    runId: null,
    skipIds: new Set(),
    tokens: null,
    openReasoning: new Set(),
    openSteps: new Set(),
    prompt: '',
    attachments: [],
    expandedFiles: new Set(),
    liveDelta: '',
    skillId: null,
  };
}

/**
 * Reduce one streamed agent event into a group's state. Routes the event to the turn that OWNS its run by
 * `runId` — NOT by array position. A run's first event arrives before any turn is bound to it, so an
 * unbound freshly-started last turn (runId `null`, just created when the run was launched) adopts this
 * run's id. An event whose runId matches no turn and is not that first event is a STRAGGLER from a
 * previous/aborted run (e.g. a late terminal after a Stop→restart); it is dropped (returns `cur` unchanged)
 * so it cannot terminate or re-flag the new live run, nor render its text in the wrong turn. The
 * group-level run flags (`running` / `paused` / `runId`) — which drive the pause/steer/stop controls —
 * track the ACTIVE (last) turn only. Pure; unit-tested. Returns the SAME reference when nothing changed.
 */
export function applyAgentEvent(cur: GroupState, e: AgentEvent): GroupState {
  const last = cur.turns.length - 1;
  let idx = cur.turns.findIndex((t) => t.runId === e.runId);
  if (idx === -1) {
    if (cur.turns[last]?.runId === null) idx = last; // bind the just-started turn to this run
    else return cur; // straggler — owns no turn and is not the active run
  }
  const turn = cur.turns[idx];
  if (turn === undefined) return cur;
  const newTurns = [...cur.turns];
  newTurns[idx] = { ...turn, runId: turn.runId ?? e.runId, events: [...turn.events, e] };
  const isTerminal = e.kind === 'done' || e.kind === 'error';
  let { running, paused, runId } = cur;
  if (idx === last) {
    runId = isTerminal ? null : (runId ?? e.runId);
    if (isTerminal) {
      running = false;
      paused = false;
    } else if (e.kind === 'resumed') {
      paused = false;
    } else if (e.kind === 'paused') {
      paused = true;
    }
  }
  // A settled event supersedes whatever was streaming toward it, so the tail is dropped here — the
  // panel never shows a half-finished decision beside the finished one.
  return { ...cur, turns: newTurns, running, paused, runId, liveDelta: '' };
}

/** Serialize attachment content as a markdown preamble prepended to the prompt. */
export function serializeAttachments(attachments: Attachment[], prompt: string): string {
  if (attachments.length === 0) return prompt;
  const parts: string[] = [];
  for (const a of attachments) {
    if (a.kind === 'selection') {
      parts.push(`[Selected text from page]\n> ${a.content.slice(0, 8000)}`);
    } else if (a.kind === 'file') {
      parts.push(`[File: ${a.label}]\n\`\`\`\n${a.content.slice(0, 8000)}\n\`\`\``);
    } else if (a.kind === 'screenshot') {
      parts.push(`[Screenshot attached — ${a.label}]`);
    }
  }
  return `${parts.join('\n\n')}\n\n---\n\n${prompt}`;
}

export function attachmentMeta(attachments: Attachment[]) {
  return attachments.map((attachment) => ({
    kind: attachment.kind,
    label: attachment.label,
  }));
}

/** Human-readable label per event kind, used in the exported chat-log transcript. */
const EVENT_KIND_LABEL: Record<AgentEvent['kind'], string> = {
  plan: 'Plan',
  decision: 'Decision',
  step_start: 'Step start',
  step_ok: 'Step ok',
  step_error: 'Step error',
  awaiting_approval: 'Awaiting approval',
  input_action: 'Input action',
  handoff: 'Handoff',
  grant: 'Saved permission',
  paused: 'Paused',
  resumed: 'Resumed',
  steered: 'Steering',
  done: 'Response',
  error: 'Error',
};

/** Metadata prepended to an exported chat-log transcript (all optional beyond the export time). */
export interface ConversationLogMeta {
  exportedAt: number;
  groupId: string | null;
  provider?: string;
  autonomy?: string;
  effort?: string;
  tokens?: TokenUsageSnapshot | null;
}

/** UTC time-of-day (`HH:MM:SS`) from an epoch-ms timestamp — compact per-event prefix in the log. */
function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

/**
 * Render the panel's live turns into a complete, self-contained markdown transcript — every turn's
 * prompt plus each streamed event (kind, time, message, detail) in order. Pure so it's unit-testable;
 * the panel writes the result to `~/tepegoz` via the host `exportChatLog`.
 */
export function serializeConversationLog(turns: Turn[], meta: ConversationLogMeta): string {
  const parts: string[] = ['# Tepegöz Agent — Chat Log', ''];
  parts.push(`- Exported: ${new Date(meta.exportedAt).toISOString()}`);
  if (meta.groupId !== null) parts.push(`- Group: ${meta.groupId}`);
  if (meta.provider !== undefined) parts.push(`- Provider: ${meta.provider}`);
  if (meta.autonomy !== undefined) parts.push(`- Autonomy: ${meta.autonomy}`);
  if (meta.effort !== undefined) parts.push(`- Effort: ${meta.effort}`);
  if (meta.tokens != null) {
    parts.push(
      `- Tokens: ${String(meta.tokens.totalTokens)} ` +
        `(${String(meta.tokens.inputTokens)} in / ${String(meta.tokens.outputTokens)} out)`,
    );
  }
  parts.push('', '---', '');

  if (turns.length === 0) {
    parts.push('_No messages in this conversation._', '');
    return parts.join('\n');
  }

  turns.forEach((turn, i) => {
    const promptText = turn.prompt.trim();
    parts.push(`## Turn ${String(i + 1)}`, '', '**You:**', '', promptText.length > 0 ? promptText : '_(empty)_', '');
    if (turn.events.length === 0) {
      parts.push('_No agent events recorded._', '');
    } else {
      for (const e of turn.events) {
        const label = EVENT_KIND_LABEL[e.kind];
        parts.push(`- \`[${clock(e.ts)}] ${label}\` ${e.message.trim()}`);
        const detail = e.detail?.trim() ?? '';
        if (detail.length > 0) parts.push(`  - ${detail}`);
      }
      parts.push('');
    }
    parts.push('---', '');
  });

  return parts.join('\n');
}

export function stateFromConversation(detail: AgentConversationDetail): GroupState {
  return {
    ...emptyGroupState(),
    turns: detail.turns.map((turn) => ({
      id: turn.id,
      prompt: turn.prompt,
      runId: turn.runId ?? null,
      events: turn.events.map((event) => ({
        runId: event.runId,
        groupId: event.groupId,
        kind: event.kind,
        message: event.message,
        ts: event.ts,
        ...(event.detail !== undefined ? { detail: event.detail } : {}),
      })),
    })),
  };
}
