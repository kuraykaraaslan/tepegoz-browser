import type { JournalEntry, JournalReader } from '@tepegoz/journal-tools';
import { EventJournal } from '@tepegoz/persistence';
import { getDb } from '../db/database.electron';

/** Best-effort one-line summary of a stored agent event payload (already redacted at write time). */
function summarize(payload: unknown): string {
  if (payload !== null && typeof payload === 'object') {
    const p = payload as { message?: unknown; detail?: unknown };
    const message = typeof p.message === 'string' ? p.message : '';
    const detail = typeof p.detail === 'string' ? p.detail : '';
    const joined = detail.length > 0 ? `${message} — ${detail}` : message;
    if (joined.length > 0) return joined.length > 200 ? `${joined.slice(0, 200)}…` : joined;
  }
  return '';
}

/**
 * Desktop `JournalReader` for `@tepegoz/journal-tools`: exposes the append-only Event Journal to the
 * `journal_search_events` agent tool as a compact, read-only projection. Keeping the SQLite/persistence
 * dependency here lets the tools package stay Electron- and persistence-free. Returns `[]` before the
 * database is ready rather than throwing (the tool is best-effort observability).
 */
export const journalHost: JournalReader = {
  recentEvents: (limit, correlationId): JournalEntry[] => {
    const db = getDb();
    if (db === null) return [];
    return EventJournal.readRecent(db, limit, correlationId).map((e) => ({
      type: e.type,
      ts: e.ts,
      actor: e.actor,
      correlationId: e.correlationId,
      summary: summarize(e.payload),
    }));
  },
};
