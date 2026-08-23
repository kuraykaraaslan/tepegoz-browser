import { beforeEach, describe, it, expect } from 'vitest';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { AgentConversationStore } from './agent-conversation-store';

/**
 * The agent history store's contract. This suite exists because the store shipped without one and its
 * very first INSERT was dead on arrival: `ensure` bound the caller's whole input object, `prompt`
 * included, at a statement that never declares `@prompt` — so every `agent:run` failed with
 * "Unknown named parameter 'prompt'" before a single turn was written. Like every persistence suite
 * here it runs on a real SQLite database, in-process via `node:sqlite`.
 */

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CONVERSATION = uuid(1);
const GROUP = 'group-1';

function beginTurn(turnId: string, prompt: string, ts: number): void {
  AgentConversationStore.ensure(db, { id: CONVERSATION, groupId: GROUP, prompt, ts });
  AgentConversationStore.addTurn(db, {
    id: turnId,
    conversationId: CONVERSATION,
    runId: `run-${turnId}`,
    prompt,
    attachments: [{ kind: 'selection', label: 'selected text' }],
    ts,
  });
}

describe('agent conversation history', () => {
  it('writes the opening turn — the path that threw on every run', () => {
    beginTurn(uuid(2), 'Book a table at eight', 1_000);
    const detail = AgentConversationStore.get(db, CONVERSATION);
    expect(detail?.turns).toHaveLength(1);
    expect(detail?.turns[0]?.prompt).toBe('Book a table at eight');
  });

  it('keeps the attachments it was given, as metadata not as a bound array', () => {
    beginTurn(uuid(3), 'Summarise this page', 1_000);
    expect(AgentConversationStore.get(db, CONVERSATION)?.turns[0]?.attachments).toEqual([
      { kind: 'selection', label: 'selected text' },
    ]);
  });

  it('summarises the prompt into the conversation title, and keeps it across later turns', () => {
    beginTurn(uuid(4), 'Book a table at eight', 1_000);
    const title = AgentConversationStore.get(db, CONVERSATION)?.summary.title;
    expect(title?.length).toBeGreaterThan(0);
    beginTurn(uuid(5), 'Now make it nine', 2_000);
    const after = AgentConversationStore.get(db, CONVERSATION)?.summary;
    // The title tracks the FIRST prompt (what the conversation is about); the preview tracks the last.
    expect(after?.title).toBe(title);
    expect(after?.turnCount).toBe(2);
    expect(after?.preview).toBe('Now make it nine');
  });

  it('re-ensuring an existing conversation adds a turn instead of restarting it', () => {
    beginTurn(uuid(6), 'First', 1_000);
    beginTurn(uuid(7), 'Second', 2_000);
    expect(AgentConversationStore.get(db, CONVERSATION)?.summary.startedAt).toBe(1_000);
  });

  it('carries a terminal event into the turn status and the conversation preview', () => {
    const turnId = uuid(8);
    beginTurn(turnId, 'Book a table at eight', 1_000);
    AgentConversationStore.appendEvent(db, turnId, {
      runId: `run-${turnId}`,
      groupId: GROUP,
      kind: 'done',
      message: 'Booked for 20:00',
      ts: 3_000,
    });
    const detail = AgentConversationStore.get(db, CONVERSATION);
    expect(detail?.turns[0]?.status).toBe('completed');
    expect(detail?.turns[0]?.responseSummary).toBe('Booked for 20:00');
    expect(detail?.summary.preview).toBe('Booked for 20:00');
    expect(detail?.summary.lastRunId).toBe(`run-${turnId}`);
  });

  it('ignores an event for a turn it does not have, rather than throwing', () => {
    expect(() => {
      AgentConversationStore.appendEvent(db, uuid(9), {
        runId: 'run-x',
        groupId: GROUP,
        kind: 'done',
        message: 'orphan',
        ts: 3_000,
      });
    }).not.toThrow();
  });

  it('finds a conversation by what was said in a turn, not only by its title', () => {
    beginTurn(uuid(10), 'Book a table at eight', 1_000);
    expect(AgentConversationStore.list(db, { query: 'table' })).toHaveLength(1);
    expect(AgentConversationStore.list(db, { query: 'nothing-like-this' })).toEqual([]);
  });

  it('deletes a conversation together with its turns (no orphan rows left behind)', () => {
    const turnId = uuid(11);
    beginTurn(turnId, 'First', 1_000);
    AgentConversationStore.delete(db, CONVERSATION);
    expect(AgentConversationStore.get(db, CONVERSATION)).toBeNull();
    const orphans = db
      .prepare('SELECT COUNT(*) AS n FROM agent_conversation_turns WHERE conversation_id = ?')
      .get(CONVERSATION) as { n: number };
    expect(orphans.n).toBe(0);
  });
});
