import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import { HistoryStore, migrate, openDatabase, type Db } from '@tepegoz/persistence';
import { BookmarkTreeStore } from '@tepegoz/bookmarks';

/**
 * The single SQLite "DB connector" for the user-data directory (`%APPDATA%/tepegoz/tepegoz.db`): the
 * Event Journal, blob store, kv settings, and browsing history all live here (Chrome keeps its History
 * as SQLite likewise). Opened once after `app.whenReady()`.
 *
 * The database is `node:sqlite`, built into the runtime. It used to be `better-sqlite3`, whose `.node`
 * binary had to match the Electron ABI and therefore had to be rebuilt from source on every machine;
 * the failure was silent, so this opener degrades rather than throws — history/journal no-op and the
 * browser still runs. That fallback is kept: a corrupt or unwritable user-data directory is still real.
 */
let db: Db | null = null;
let initialized = false;

export function initDatabase(): void {
  if (initialized) return;
  initialized = true;
  const userData = app.getPath('userData');

  // Chrome-like layout: a folder for installed (third-party) extensions sits alongside the DB.
  try {
    mkdirSync(join(userData, 'Extensions'), { recursive: true });
  } catch (err) {
    Logger.warn('Failed to create Extensions directory', { err: String(err) });
  }

  const dbPath = join(userData, 'tepegoz.db');
  try {
    const opened = openDatabase(dbPath);
    // Schema migration stays synchronous: the stores read against this schema the instant `initStores`
    // returns, so it must be in place before the first window opens.
    migrate(opened);
    db = opened;
    Logger.info('Database ready', { path: dbPath });
    // History maintenance is NOT on the launch critical path — it is bounded catch-up work (a fold
    // backfill only after a version bump; a retention sweep) whose worst case is stale-until-next-tick
    // search results, never a wrong write. Run it a tick later so it does not delay the first paint.
    setImmediate(() => {
      try {
        // Backfill the case-folded history search columns for rows written before migration 16, and
        // re-fold everything after a HISTORY_FOLD_VERSION bump. No-op once the version marker matches.
        const refolded = HistoryStore.reindexFoldsIfStale(opened);
        if (refolded > 0) Logger.info('Re-folded history search index', { rows: refolded });
        // The same backfill for bookmarks (migration 17). Separate marker, same shape: bookmark rows
        // written before it have empty fold columns and would be unsearchable until rewritten.
        const bookmarksRefolded = BookmarkTreeStore.reindexFoldsIfStale(opened);
        if (bookmarksRefolded > 0) {
          Logger.info('Re-folded bookmark search index', { rows: bookmarksRefolded });
        }
        // Startup retention pass — history is otherwise unbounded (one row per unique URL, forever).
        const pruned = HistoryStore.prune(opened, Date.now());
        if (pruned > 0) Logger.info('Pruned expired history entries', { pruned });
      } catch (err) {
        Logger.warn('Deferred history maintenance failed', { err: String(err) });
      }
    });
  } catch (err) {
    db = null;
    Logger.error('Database unavailable (native module not loaded?) — history/journal disabled', {
      err: String(err),
    });
  }
}

/** The DB, or null when unavailable. Callers MUST treat null as "persistence off" and no-op. */
export function getDb(): Db | null {
  return db;
}

/** Close the connection (flushes the WAL checkpoint). Called once from `will-quit`, after every
 *  window has closed and persisted — `getDb()` returns null afterwards, so any late event handler
 *  (e.g. a straggling navigation) degrades to the same "persistence off" no-op path as a failed open. */
export function closeDatabase(): void {
  if (db === null) return;
  try {
    db.close();
  } catch (err) {
    Logger.warn('Failed to close database cleanly', { err: String(err) });
  }
  db = null;
}
