import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { HistoryStore } from './history-store';
import { DownloadStore } from './download-store';
import { AgentConversationStore } from './agent-conversation-store';

/**
 * The time-ranged deletes behind "Clear browsing data".
 *
 * Each store answers a different question about WHICH timestamp a range applies to, and getting that
 * wrong is invisible until someone loses data they meant to keep — or keeps data they meant to lose.
 */
const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('HistoryStore.deleteSince', () => {
  it('ranges on the LAST visit, so a page re-opened this hour is part of this hour', () => {
    // The row is one per URL: a page first seen last year but opened ten minutes ago belongs to the
    // last hour of browsing, and leaving it would defeat the reason someone picks "last hour".
    HistoryStore.record(db, { url: 'https://old.example/', title: 'Old', ts: NOW - 48 * HOUR });
    HistoryStore.record(db, { url: 'https://revisited.example/', title: 'Back', ts: NOW - 48 * HOUR });
    HistoryStore.record(db, { url: 'https://revisited.example/', title: 'Back', ts: NOW - 10 * 60_000 });

    expect(HistoryStore.deleteSince(db, NOW - HOUR)).toBe(1);
    expect(HistoryStore.list(db).map((h) => h.url)).toEqual(['https://old.example/']);
  });

  it('keeps everything older than the cutoff', () => {
    HistoryStore.record(db, { url: 'https://a.example/', title: 'A', ts: NOW - 2 * HOUR });
    expect(HistoryStore.deleteSince(db, NOW - HOUR)).toBe(0);
    expect(HistoryStore.count(db)).toBe(1);
  });
});

describe('DownloadStore.clearTerminalSince', () => {
  function download(id: string, status: string, createdAt: number): void {
    DownloadStore.upsert(db, {
      id,
      url: `https://files.example/${id}`,
      filename: `${id}.bin`,
      mimeType: 'application/octet-stream',
      status: status as never,
      risk: 'safe',
      trustVerdict: 'unknown',
      receivedBytes: 1,
      totalBytes: 1,
      canResume: false,
      createdAt,
      updatedAt: NOW,
      completedAt: null,
      error: null,
      sha256: null,
      provenance: { actor: 'user', sourceUrl: null, sourceOrigin: null, correlationId: null },
    } as never);
  }

  it('ranges on when the download STARTED, not when it last ticked', () => {
    // `updated_at` moves with every progress write, so a long transfer begun yesterday would be swept
    // up by an hour-long range. A download belongs to the moment it was started.
    download('old-but-active', 'completed', NOW - 48 * HOUR);
    download('recent', 'completed', NOW - 10 * 60_000);

    expect(DownloadStore.clearTerminalSince(db, NOW - HOUR)).toBe(1);
    expect(DownloadStore.list(db).map((d) => d.id)).toEqual(['old-but-active']);
  });

  it('never removes a transfer that is still running', () => {
    // Its row is what tracks it; deleting that leaves a download nothing is watching.
    download('in-flight', 'downloading', NOW - 10 * 60_000);
    expect(DownloadStore.clearTerminalSince(db, NOW - HOUR)).toBe(0);
    expect(DownloadStore.list(db)).toHaveLength(1);
  });
});

describe('AgentConversationStore.clearSince', () => {
  it('removes recent conversations and their turns, keeping older ones', () => {
    const old = '00000000-0000-4000-8000-000000000001';
    const recent = '00000000-0000-4000-8000-000000000002';
    AgentConversationStore.ensure(db, {
      id: old,
      groupId: 'g',
      prompt: 'Older',
      ts: NOW - 48 * HOUR,
    });
    AgentConversationStore.ensure(db, {
      id: recent,
      groupId: 'g',
      prompt: 'Newer',
      ts: NOW - 10 * 60_000,
    });
    AgentConversationStore.addTurn(db, {
      id: '00000000-0000-4000-8000-000000000003',
      conversationId: recent,
      runId: 'run-1',
      prompt: 'Newer',
      attachments: [],
      ts: NOW - 10 * 60_000,
    });

    expect(AgentConversationStore.clearSince(db, NOW - HOUR)).toBe(1);
    expect(AgentConversationStore.get(db, recent)).toBeNull();
    expect(AgentConversationStore.get(db, old)).not.toBeNull();
    // Turns cascade on the FK — a cleared conversation must not leave its prompts behind, which is the
    // text the user actually asked to be rid of.
    const orphans = db
      .prepare('SELECT COUNT(*) AS n FROM agent_conversation_turns')
      .get() as { n: number };
    expect(orphans.n).toBe(0);
  });
});
