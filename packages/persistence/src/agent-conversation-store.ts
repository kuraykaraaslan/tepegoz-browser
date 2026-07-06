import type {
  AgentAttachmentMeta,
  AgentConversationDetail,
  AgentConversationStatus,
  AgentConversationSummary,
  AgentConversationTurn,
  AgentHistoryEvent,
} from '@tepegoz/agent-history';
import { summarizeConversationPrompt, terminalStatusFromEvents } from '@tepegoz/agent-history';
import type { Db } from './db';

interface ConversationRow {
  id: string;
  group_id: string;
  title: string;
  preview: string;
  status: AgentConversationStatus;
  turn_count: number;
  started_at: number;
  updated_at: number;
  last_run_id: string | null;
}

interface TurnRow {
  id: string;
  conversation_id: string;
  run_id: string | null;
  prompt: string;
  response_summary: string | null;
  status: AgentConversationStatus;
  events_json: string;
  attachments_json: string;
  created_at: number;
  updated_at: number;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToSummary(row: ConversationRow): AgentConversationSummary {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    preview: row.preview,
    status: row.status,
    turnCount: row.turn_count,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    ...(row.last_run_id !== null ? { lastRunId: row.last_run_id } : {}),
  };
}

function rowToTurn(row: TurnRow): AgentConversationTurn {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    ...(row.run_id !== null ? { runId: row.run_id } : {}),
    prompt: row.prompt,
    ...(row.response_summary !== null ? { responseSummary: row.response_summary } : {}),
    status: row.status,
    events: parseJson<AgentHistoryEvent[]>(row.events_json, []),
    attachments: parseJson<AgentAttachmentMeta[]>(row.attachments_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function boundedLimit(limit: number): number {
  return Math.max(1, Math.min(Math.trunc(limit), 200));
}

export class AgentConversationStore {
  static list(db: Db, input: { query?: string; limit?: number; offset?: number } = {}): AgentConversationSummary[] {
    const limit = boundedLimit(input.limit ?? 50);
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const query = input.query?.trim() ?? '';
    if (query.length === 0) {
      const rows = db
        .prepare('SELECT * FROM agent_conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset) as ConversationRow[];
      return rows.map(rowToSummary);
    }
    const like = `%${query}%`;
    const rows = db
      .prepare(
        `SELECT DISTINCT c.* FROM agent_conversations c
         LEFT JOIN agent_conversation_turns t ON t.conversation_id = c.id
         WHERE c.title LIKE ? OR c.preview LIKE ? OR t.prompt LIKE ? OR t.response_summary LIKE ?
         ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`,
      )
      .all(like, like, like, like, limit, offset) as ConversationRow[];
    return rows.map(rowToSummary);
  }

  static get(db: Db, id: string): AgentConversationDetail | null {
    const row = db.prepare('SELECT * FROM agent_conversations WHERE id = ?').get(id) as
      | ConversationRow
      | undefined;
    if (row === undefined) return null;
    const turns = db
      .prepare('SELECT * FROM agent_conversation_turns WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(id) as TurnRow[];
    return { summary: rowToSummary(row), turns: turns.map(rowToTurn) };
  }

  static ensure(db: Db, input: { id: string; groupId: string; prompt: string; ts: number }): void {
    const { title, preview } = summarizeConversationPrompt(input.prompt);
    db.prepare(
      `INSERT OR IGNORE INTO agent_conversations (
        id, group_id, title, preview, status, turn_count, started_at, updated_at, last_run_id
      ) VALUES (
        @id, @groupId, @title, @preview, 'active', 0, @ts, @ts, NULL
      )`,
    ).run({ ...input, title, preview });
  }

  static addTurn(
    db: Db,
    input: {
      id: string;
      conversationId: string;
      runId: string;
      prompt: string;
      attachments: AgentAttachmentMeta[];
      ts: number;
    },
  ): void {
    db.prepare(
      `INSERT INTO agent_conversation_turns (
        id, conversation_id, run_id, prompt, response_summary, status, events_json,
        attachments_json, created_at, updated_at
      ) VALUES (
        @id, @conversationId, @runId, @prompt, NULL, 'active', '[]', @attachmentsJson, @ts, @ts
      )`,
    ).run({ ...input, attachmentsJson: JSON.stringify(input.attachments) });
    this.refreshSummary(db, input.conversationId, input.runId, input.ts);
  }

  static appendEvent(db: Db, turnId: string, event: AgentHistoryEvent): void {
    const row = db.prepare('SELECT * FROM agent_conversation_turns WHERE id = ?').get(turnId) as
      | TurnRow
      | undefined;
    if (row === undefined) return;
    const events = [...parseJson<AgentHistoryEvent[]>(row.events_json, []), event];
    const status = terminalStatusFromEvents(events);
    const response = latestResponse(events, row.response_summary ?? undefined);
    db.prepare(
      `UPDATE agent_conversation_turns
       SET events_json = ?, status = ?, response_summary = ?, updated_at = ?
       WHERE id = ?`,
    ).run(JSON.stringify(events), status, response, event.ts, turnId);
    this.refreshSummary(db, row.conversation_id, event.runId, event.ts);
  }

  static delete(db: Db, id: string): void {
    db.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id);
  }

  static clear(db: Db): void {
    db.prepare('DELETE FROM agent_conversations').run();
  }

  private static refreshSummary(db: Db, conversationId: string, runId: string, ts: number): void {
    const turns = db
      .prepare('SELECT * FROM agent_conversation_turns WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as TurnRow[];
    const firstPrompt = turns[0]?.prompt ?? '';
    const { title } = summarizeConversationPrompt(firstPrompt);
    const latest = turns.at(-1);
    const preview = latest?.response_summary ?? latest?.prompt ?? '';
    const status = latest?.status ?? 'active';
    db.prepare(
      `UPDATE agent_conversations
       SET title = ?, preview = ?, status = ?, turn_count = ?, updated_at = ?, last_run_id = ?
       WHERE id = ?`,
    ).run(title, preview.slice(0, 180), status, turns.length, ts, runId, conversationId);
  }
}

function latestResponse(events: AgentHistoryEvent[], fallback?: string): string | null {
  const prose = [...events].reverse().find((event) =>
    event.kind === 'done' || event.kind === 'error' || event.kind === 'handoff'
  );
  const text = prose?.message ?? fallback ?? null;
  return text === null ? null : text.slice(0, 4000);
}
