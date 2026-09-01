import { foldForSearch } from '@tepegoz/i18n';
import type { Db } from './db';
import { MetaStore } from './meta';

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
 * Bump when {@link foldForSearch}'s output changes, so {@link HistoryStore.reindexFoldsIfStale}
 * re-folds every stored row on the next startup rather than leaving old rows searchable only by the
 * previous rule. v1 = the initial `url_fold` / `title_fold` shadow columns (migration 16).
 */
export const HISTORY_FOLD_VERSION = 1;
const FOLD_VERSION_META_KEY = 'history_fold_version';

/**
 * Browsing history (L1). One row per URL; repeat visits coalesce (bump `visit_count` + `ts` + title),
 * mirroring Chrome's `urls` table. Reads are trusted DB output; the untrusted boundary (renderer
 * queries/deletes) is validated at the IPC layer, not here.
 *
 * Search matches against case-folded shadow columns (`url_fold` / `title_fold`), folded in the writer
 * with {@link foldForSearch} — the omnibox's rule, and the same choice `bookmark_tags.tag_key` makes.
 * SQLite's built-in `LIKE` / `LOWER` case-fold ASCII only, so a page the user titled "Şişli Gezisi"
 * was unreachable by typing "şişli" (or "sisli"); folding in TypeScript collapses the Turkish i family
 * and strips accents so it is.
 */
export class HistoryStore {
  static record(db: Db, entry: { url: string; title: string; ts: number }): void {
    db.prepare(
      `INSERT INTO history (url, title, ts, visit_count, url_fold, title_fold)
       VALUES (@url, @title, @ts, 1, @urlFold, @titleFold)
       ON CONFLICT(url) DO UPDATE SET
         title = @title, ts = @ts, visit_count = visit_count + 1, title_fold = @titleFold`,
    ).run({
      ...entry,
      urlFold: foldForSearch(entry.url),
      titleFold: foldForSearch(entry.title),
    });
  }

  static list(db: Db, limit = 50, offset = 0): HistoryEntry[] {
    const rows = db
      .prepare('SELECT url, title, ts, visit_count FROM history ORDER BY ts DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as HistoryRow[];
    return rows.map(toEntry);
  }

  static search(db: Db, query: string, limit = 50, offset = 0): HistoryEntry[] {
    const like = `%${foldForSearch(query)}%`;
    const rows = db
      .prepare(
        `SELECT url, title, ts, visit_count FROM history
         WHERE url_fold LIKE ? OR title_fold LIKE ? ORDER BY ts DESC LIMIT ? OFFSET ?`,
      )
      .all(like, like, limit, offset) as HistoryRow[];
    return rows.map(toEntry);
  }

  /** Refine a recorded page's title (arrives after navigation) without bumping the visit count. */
  static setTitle(db: Db, url: string, title: string): void {
    db.prepare('UPDATE history SET title = ?, title_fold = ? WHERE url = ?').run(
      title,
      foldForSearch(title),
      url,
    );
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

  /**
   * Re-fold `url_fold` / `title_fold` for every row when the stored fold version does not match
   * {@link HISTORY_FOLD_VERSION}. Owns two cases with one code path: the initial backfill of rows that
   * predate migration 16 (the meta key is then unset), and a re-fold after {@link foldForSearch}'s
   * rule changes. Idempotent — a matching version marker makes it a no-op. Returns the row count it
   * refolded (0 when up to date). Call once at startup, right after `migrate`.
   */
  static reindexFoldsIfStale(db: Db): number {
    if (MetaStore.get(db, FOLD_VERSION_META_KEY) === String(HISTORY_FOLD_VERSION)) return 0;
    const rows = db.prepare('SELECT id, url, title FROM history').all() as {
      id: number;
      url: string;
      title: string;
    }[];
    const update = db.prepare('UPDATE history SET url_fold = ?, title_fold = ? WHERE id = ?');
    db.transaction(() => {
      for (const r of rows) update.run(foldForSearch(r.url), foldForSearch(r.title), r.id);
      MetaStore.set(db, FOLD_VERSION_META_KEY, String(HISTORY_FOLD_VERSION));
    })();
    return rows.length;
  }
}
