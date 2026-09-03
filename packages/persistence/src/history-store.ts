import { foldForSearch } from '@tepegoz/i18n';
import type { Db } from './db';
import { MetaStore } from './meta';
import { likeContains } from './sql-like';

/** A browsing-history entry (one per URL; visits coalesced). Shared with the app/IPC layer. */
export interface HistoryEntry {
  url: string;
  title: string;
  ts: number;
  visitCount: number;
  /**
   * The page's favicon as an inline `data:` URL, or `null` until one is captured. Written by
   * {@link HistoryStore.setFavicon} from the same bytes the tab strip shows; consumed by the omnibox,
   * the history page, and the back/forward menu, none of which may fetch a remote icon from the
   * trusted chrome.
   */
  favicon: string | null;
}

interface HistoryRow {
  url: string;
  title: string;
  ts: number;
  visit_count: number;
  favicon: string | null;
}

function toEntry(row: HistoryRow): HistoryEntry {
  return {
    url: row.url,
    title: row.title,
    ts: row.ts,
    visitCount: row.visit_count,
    favicon: row.favicon ?? null,
  };
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
      .prepare(
        'SELECT url, title, ts, visit_count, favicon FROM history ORDER BY ts DESC LIMIT ? OFFSET ?',
      )
      .all(limit, offset) as HistoryRow[];
    return rows.map(toEntry);
  }

  static search(db: Db, query: string, limit = 50, offset = 0): HistoryEntry[] {
    // `likeContains` escapes `%` / `_` so a query of "_" or "%" matches literally, not every row
    // (omnibox track § A3); the `ESCAPE '\'` clause names the escape character it uses.
    const like = likeContains(foldForSearch(query));
    const rows = db
      .prepare(
        `SELECT url, title, ts, visit_count, favicon FROM history
         WHERE url_fold LIKE ? ESCAPE '\\' OR title_fold LIKE ? ESCAPE '\\'
         ORDER BY ts DESC LIMIT ? OFFSET ?`,
      )
      .all(like, like, limit, offset) as HistoryRow[];
    return rows.map(toEntry);
  }

  /**
   * Candidate window for the omnibox, shaped for the ranker that consumes it.
   *
   * {@link search} orders purely by recency (`ts DESC`) with an `offset`, which is right for the
   * History page. The omnibox is different: its ranker (`historySuggestions` in `@tepegoz/omnibox`)
   * re-sorts the rows it is handed by `visitCount`, so a recency-only window means a heavily-visited
   * page that is not among the 50 most _recent_ matches never reaches the ranker at all — it cannot
   * be scored however often it was visited (omnibox track § A4: "candidate window is recency-shaped,
   * ranking is frequency-shaped").
   *
   * So this window scores each match as `visit_count` plus a bounded freshness bonus — about `30` for
   * a page seen today, decaying to `~1` after a month — and takes the top `limit`. A frequently
   * visited old page and a just-seen new one are therefore both always in the window. The bonus is
   * clamped at `ts` in the future (`MAX(nowTs - ts, 0)`) so clock skew cannot divide the score by a
   * value near zero. `nowTs` is injected, not read from a clock here, so the ordering is a pure
   * function of its inputs and a test can pin it.
   */
  static searchForOmnibox(db: Db, query: string, nowTs: number, limit = 50): HistoryEntry[] {
    const like = likeContains(foldForSearch(query));
    const rows = db
      .prepare(
        `SELECT url, title, ts, visit_count, favicon FROM history
         WHERE url_fold LIKE ? ESCAPE '\\' OR title_fold LIKE ? ESCAPE '\\'
         ORDER BY visit_count + 30.0 / (1.0 + MAX(? - ts, 0) / 86400000.0) DESC, ts DESC
         LIMIT ?`,
      )
      .all(like, like, nowTs, limit) as HistoryRow[];
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

  /**
   * Attach the page's favicon (an inline `data:` URL) to an existing history row. Like {@link setTitle}
   * this only UPDATEs — a favicon with no recorded visit is meaningless, so a URL that was never
   * `record`ed (private window, non-web scheme) is silently a no-op. Idempotent; the caller passes the
   * same bytes it handed the tab strip.
   */
  static setFavicon(db: Db, url: string, favicon: string): void {
    db.prepare('UPDATE history SET favicon = ? WHERE url = ?').run(favicon, url);
  }

  /**
   * The stored favicon for one exact URL, or `null` when the URL is unknown or has none yet. Used by
   * the back/forward menu, which has a list of navigation-entry URLs and wants each one's icon
   * without pulling the whole row.
   */
  static faviconFor(db: Db, url: string): string | null {
    const row = db.prepare('SELECT favicon FROM history WHERE url = ?').get(url) as
      | { favicon: string | null }
      | undefined;
    return row?.favicon ?? null;
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

  /**
   * Delete entries visited at or after `cutoff` — the time-ranged half of "Clear browsing data".
   *
   * `ts` is the LAST visit, which is the honest column to range on: a page first seen last year but
   * opened ten minutes ago is part of the last hour of browsing, and leaving it behind would defeat
   * the reason someone reaches for "last hour". The row is one per URL, so there is no partial
   * deletion to offer instead.
   */
  static deleteSince(db: Db, cutoff: number): number {
    return db.prepare('DELETE FROM history WHERE ts >= ?').run(cutoff).changes;
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
