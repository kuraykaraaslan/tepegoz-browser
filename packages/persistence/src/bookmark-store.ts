import type { Db } from './db';

/** A bookmarked page (one per URL). Shared with the app/IPC layer. */
export interface BookmarkEntry {
  url: string;
  title: string;
  /** When it was bookmarked (epoch ms). */
  ts: number;
}

/**
 * Bookmarks (L1). One row per URL (re-bookmarking the same URL just refreshes the title). Reads are
 * trusted DB output; the untrusted boundary (renderer add/remove) is validated at the IPC layer.
 */
export class BookmarkStore {
  /** Add or refresh a bookmark. Idempotent on URL — a second add updates the title, not a duplicate. */
  static add(db: Db, entry: { url: string; title: string; ts: number }): void {
    db.prepare(
      `INSERT INTO bookmarks (url, title, ts) VALUES (@url, @title, @ts)
       ON CONFLICT(url) DO UPDATE SET title = @title`,
    ).run(entry);
  }

  static remove(db: Db, url: string): void {
    db.prepare('DELETE FROM bookmarks WHERE url = ?').run(url);
  }

  static isBookmarked(db: Db, url: string): boolean {
    const row = db.prepare('SELECT 1 FROM bookmarks WHERE url = ?').get(url);
    return row !== undefined;
  }

  /** Newest-first (most recently bookmarked). The SELECT column list IS the entry shape (url, title,
   *  ts — no snake_case columns), so rows are the entries; no mapper layer. */
  static list(db: Db, limit = 500): BookmarkEntry[] {
    return db
      .prepare('SELECT url, title, ts FROM bookmarks ORDER BY ts DESC LIMIT ?')
      .all(limit) as BookmarkEntry[];
  }

  static search(db: Db, query: string, limit = 500): BookmarkEntry[] {
    const like = `%${query}%`;
    return db
      .prepare(
        `SELECT url, title, ts FROM bookmarks
         WHERE url LIKE ? OR title LIKE ? ORDER BY ts DESC LIMIT ?`,
      )
      .all(like, like, limit) as BookmarkEntry[];
  }

  static count(db: Db): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM bookmarks').get() as { n: number };
    return row.n;
  }
}
