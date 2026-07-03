import type { Db } from './db';

/** A browsing-history entry (one per URL; visits coalesced). Shared with the app/IPC layer. */
export interface HistoryEntry {
  url: string;
  title: string;
  ts: number;
  visitCount: number;
}

interface HistoryRow {
  url: string;
  title: string;
  ts: number;
  visit_count: number;
}

function toEntry(row: HistoryRow): HistoryEntry {
  return { url: row.url, title: row.title, ts: row.ts, visitCount: row.visit_count };
}

/**
 * Browsing history (L1). One row per URL; repeat visits coalesce (bump `visit_count` + `ts` + title),
 * mirroring Chrome's `urls` table. Reads are trusted DB output; the untrusted boundary (renderer
 * queries/deletes) is validated at the IPC layer, not here.
 */
export class HistoryStore {
  static record(db: Db, entry: { url: string; title: string; ts: number }): void {
    db.prepare(
      `INSERT INTO history (url, title, ts, visit_count) VALUES (@url, @title, @ts, 1)
       ON CONFLICT(url) DO UPDATE SET title = @title, ts = @ts, visit_count = visit_count + 1`,
    ).run(entry);
  }

  static list(db: Db, limit = 50, offset = 0): HistoryEntry[] {
    const rows = db
      .prepare('SELECT url, title, ts, visit_count FROM history ORDER BY ts DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as HistoryRow[];
    return rows.map(toEntry);
  }

  static search(db: Db, query: string, limit = 50, offset = 0): HistoryEntry[] {
    const like = `%${query}%`;
    const rows = db
      .prepare(
        `SELECT url, title, ts, visit_count FROM history
         WHERE url LIKE ? OR title LIKE ? ORDER BY ts DESC LIMIT ? OFFSET ?`,
      )
      .all(like, like, limit, offset) as HistoryRow[];
    return rows.map(toEntry);
  }

  /** Refine a recorded page's title (arrives after navigation) without bumping the visit count. */
  static setTitle(db: Db, url: string, title: string): void {
    db.prepare('UPDATE history SET title = ? WHERE url = ?').run(title, url);
  }

  static deleteUrl(db: Db, url: string): void {
    db.prepare('DELETE FROM history WHERE url = ?').run(url);
  }

  /** Retention: drop entries last visited more than `maxAgeDays` ago (default 90, Chrome-like).
   *  Called once at startup — keeps the table bounded without a background job. */
  static prune(db: Db, nowTs: number, maxAgeDays = 90): number {
    const cutoff = nowTs - maxAgeDays * 24 * 60 * 60 * 1000;
    const result = db.prepare('DELETE FROM history WHERE ts < ?').run(cutoff);
    return result.changes;
  }

  static clear(db: Db): void {
    db.prepare('DELETE FROM history').run();
  }

  static count(db: Db): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM history').get() as { n: number };
    return row.n;
  }
}
