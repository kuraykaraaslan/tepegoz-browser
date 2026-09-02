import type {
  AgentAttachmentMeta,
  AgentConversationDetail,
  AgentConversationStatus,
  AgentConversationSummary,
  AgentConversationTurn,
  AgentHistoryEvent,
} from '@tepegoz/ext-agent/history';
import { summarizeConversationPrompt, terminalStatusFromEvents } from '@tepegoz/ext-agent/history';
import { foldForSearch } from '@tepegoz/i18n';
import type { Db } from './db';
import { MetaStore } from './meta';
import { likeContains, LIKE_ESCAPE_CLAUSE } from './sql-like';

/**
 * Bump when {@link foldForSearch}'s output changes, so
 * {@link AgentConversationStore.reindexFoldsIfStale} re-folds instead of leaving an index built by a
 * previous rule. v1 = the initial shadow columns (migration 18).
 */
export const AGENT_CONVERSATION_FOLD_VERSION = 1;
const FOLD_VERSION_META_KEY = 'agent_conversation_fold_version';

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
  static list(
    db: Db,
    input: { query?: string; limit?: number; offset?: number } = {},
  ): AgentConversationSummary[] {
    const limit = boundedLimit(input.limit ?? 50);
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const query = input.query?.trim() ?? '';
    if (query.length === 0) {
      const rows = db
        .prepare('SELECT * FROM agent_conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset) as ConversationRow[];
      return rows.map(rowToSummary);
    }
    // Folded shadow columns, and an ESCAPE clause. Both were missing: SQLite's LIKE folds ASCII only,
    // so a conversation that began "İSTANBUL için plan yap" could not be found by typing `istanbul` —
    // over text the user typed AT AN AGENT, which in this product is Turkish more often than anywhere
    // else in the app. And with no escaping, a query containing `%` matched every conversation.
    const like = likeContains(foldForSearch(query));
    const rows = db
      .prepare(
        `SELECT DISTINCT c.* FROM agent_conversations c
         LEFT JOIN agent_conversation_turns t ON t.conversation_id = c.id
         WHERE c.title_fold LIKE ? ${LIKE_ESCAPE_CLAUSE} OR c.preview_fold LIKE ? ${LIKE_ESCAPE_CLAUSE}
            OR t.prompt_fold LIKE ? ${LIKE_ESCAPE_CLAUSE} OR t.response_fold LIKE ? ${LIKE_ESCAPE_CLAUSE}
         ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`,
      )
      .all(like, like, like, like, limit, offset) as ConversationRow[];
    return rows.map(rowToSummary);
  }

  static get(db: Db, id: string): AgentConversationDetail | null {
    const row = db.prepare('SELECT * FROM agent_conversations WHERE id = ?').get(id) as
      ConversationRow | undefined;
    if (row === undefined) return null;
    const turns = db
      .prepare(
        'SELECT * FROM agent_conversation_turns WHERE conversation_id = ? ORDER BY created_at ASC',
      )
      .all(id) as TurnRow[];
    return { summary: rowToSummary(row), turns: turns.map(rowToTurn) };
  }

  static ensure(db: Db, input: { id: string; groupId: string; prompt: string; ts: number }): void {
    const { title, preview } = summarizeConversationPrompt(input.prompt);
    // Bound field by field, NOT `{ ...input }`: `prompt` is summarized into title/preview and is not a
    // column here, and SQLite rejects a named parameter the statement never declares — spreading the
    // caller's shape makes every field it ever gains a runtime failure on this INSERT.
    db.prepare(
      `INSERT OR IGNORE INTO agent_conversations (
        id, group_id, title, preview, status, turn_count, started_at, updated_at, last_run_id,
        title_fold, preview_fold
      ) VALUES (
        @id, @groupId, @title, @preview, 'active', 0, @ts, @ts, NULL,
        @titleFold, @previewFold
      )`,
    ).run({
      id: input.id,
      groupId: input.groupId,
      title,
      preview,
      ts: input.ts,
      titleFold: foldForSearch(title),
      previewFold: foldForSearch(preview),
    });
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
    // Same rule as `ensure`: bind exactly the declared parameters. `attachments` is serialized into
    // `attachmentsJson` and is not itself bindable (SQLite takes no arrays).
    db.prepare(
      `INSERT INTO agent_conversation_turns (
        id, conversation_id, run_id, prompt, response_summary, status, events_json,
        attachments_json, created_at, updated_at, prompt_fold, response_fold
      ) VALUES (
        @id, @conversationId, @runId, @prompt, NULL, 'active', '[]', @attachmentsJson, @ts, @ts,
        @promptFold, ''
      )`,
    ).run({
      id: input.id,
      conversationId: input.conversationId,
      runId: input.runId,
      prompt: input.prompt,
      attachmentsJson: JSON.stringify(input.attachments),
      ts: input.ts,
      promptFold: foldForSearch(input.prompt),
    });
    this.refreshSummary(db, input.conversationId, input.runId, input.ts);
  }

  static appendEvent(db: Db, turnId: string, event: AgentHistoryEvent): void {
    const row = db.prepare('SELECT * FROM agent_conversation_turns WHERE id = ?').get(turnId) as
      TurnRow | undefined;
    if (row === undefined) return;
    const events = [...parseJson<AgentHistoryEvent[]>(row.events_json, []), event];
    const status = terminalStatusFromEvents(events);
    const response = latestResponse(events, row.response_summary ?? undefined);
    db.prepare(
      `UPDATE agent_conversation_turns
       SET events_json = ?, status = ?, response_summary = ?, response_fold = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(events),
      status,
      response,
      response === null ? '' : foldForSearch(response),
      event.ts,
      turnId,
    );
    this.refreshSummary(db, row.conversation_id, event.runId, event.ts);
  }

  static delete(db: Db, id: string): void {
    db.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id);
  }

  static clear(db: Db): void {
    db.prepare('DELETE FROM agent_conversations').run();
  }

  /**
   * Re-fold every searchable column when the stored fold version does not match
   * {@link AGENT_CONVERSATION_FOLD_VERSION}. The third copy of the same contract as `HistoryStore`
   * and `BookmarkTreeStore`: one code path for the initial backfill (rows written before migration
   * 18, meta key unset) and for a re-fold after the rule changes; idempotent; returns the number of
   * rows rewritten. Call once at startup, right after `migrate`.
   */
  static reindexFoldsIfStale(db: Db): number {
    if (MetaStore.get(db, FOLD_VERSION_META_KEY) === String(AGENT_CONVERSATION_FOLD_VERSION)) {
      return 0;
    }
    const conversations = db.prepare('SELECT id, title, preview FROM agent_conversations').all() as {
      id: string;
      title: string;
      preview: string;
    }[];
    const turns = db
      .prepare('SELECT id, prompt, response_summary FROM agent_conversation_turns')
      .all() as { id: string; prompt: string; response_summary: string | null }[];
    const updateConversation = db.prepare(
      'UPDATE agent_conversations SET title_fold = ?, preview_fold = ? WHERE id = ?',
    );
    const updateTurn = db.prepare(
      'UPDATE agent_conversation_turns SET prompt_fold = ?, response_fold = ? WHERE id = ?',
    );
    db.transaction(() => {
      for (const c of conversations) {
        updateConversation.run(foldForSearch(c.title), foldForSearch(c.preview), c.id);
      }
      for (const t of turns) {
        updateTurn.run(
          foldForSearch(t.prompt),
          t.response_summary === null ? '' : foldForSearch(t.response_summary),
          t.id,
        );
      }
      MetaStore.set(db, FOLD_VERSION_META_KEY, String(AGENT_CONVERSATION_FOLD_VERSION));
    })();
    return conversations.length + turns.length;
  }

  private static refreshSummary(db: Db, conversationId: string, runId: string, ts: number): void {
    const turns = db
      .prepare(
        'SELECT * FROM agent_conversation_turns WHERE conversation_id = ? ORDER BY created_at ASC',
      )
      .all(conversationId) as TurnRow[];
    const firstPrompt = turns[0]?.prompt ?? '';
    const { title } = summarizeConversationPrompt(firstPrompt);
    const latest = turns.at(-1);
    const preview = latest?.response_summary ?? latest?.prompt ?? '';
    const status = latest?.status ?? 'active';
    db.prepare(
      `UPDATE agent_conversations
       SET title = ?, preview = ?, title_fold = ?, preview_fold = ?, status = ?, turn_count = ?,
           updated_at = ?, last_run_id = ?
       WHERE id = ?`,
    ).run(
      title,
      preview.slice(0, 180),
      foldForSearch(title),
      foldForSearch(preview.slice(0, 180)),
      status,
      turns.length,
      ts,
      runId,
      conversationId,
    );
  }
}

function latestResponse(events: AgentHistoryEvent[], fallback?: string): string | null {
  const prose = [...events]
    .reverse()
    .find((event) => event.kind === 'done' || event.kind === 'error' || event.kind === 'handoff');
  const text = prose?.message ?? fallback ?? null;
  return text === null ? null : text.slice(0, 4000);
}
