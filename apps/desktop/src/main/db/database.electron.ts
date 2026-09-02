import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  AgentConversationStore,
  HistoryStore,
  migrate,
  openDatabase,
  type Db,
} from '@tepegoz/persistence';
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
/** Set to the kept `.corrupt-*` filename when {@link openWithRepair} had to start a fresh database. */
let profileResetKeptFile: string | null = null;

/** The name the unreadable profile database was kept under, or null when no reset happened this
 *  launch. Read once by the recovery notice; nothing else should branch on it. */
export function profileWasReset(): string | null {
  return profileResetKeptFile;
}

/**
 * Open + migrate the database, and if that fails, quarantine the unreadable file and start a fresh
 * one — rung of ADR-0038's recovery ladder that keeps a corrupt profile from permanently disabling
 * persistence.
 *
 * Before this, an open or migration failure set `db = null` and every subsequent launch retried the
 * same broken file: "never crash-loop" held, but the browser stayed permanently without history,
 * bookmarks or the journal until the user found and deleted the file themselves. Now the file (and
 * its `-wal`/`-shm` sidecars) is renamed aside with a timestamp — nothing is destroyed, so a support
 * request can still recover it — and a clean database is opened in its place. Only if THAT also fails
 * does it fall through to the "persistence off" no-op path.
 *
 * Exported for its test; `initDatabase` is the only production caller.
 */
export function openWithRepair(dbPath: string): Db | null {
  try {
    const opened = openDatabase(dbPath);
    // Schema migration stays synchronous: the stores read against this schema the instant `initStores`
    // returns, so it must be in place before the first window opens.
    migrate(opened);
    return opened;
  } catch (err) {
    Logger.error('Database open/migrate failed — quarantining the file and starting fresh', {
      err: String(err),
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  let movedMain = false;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      renameSync(`${dbPath}${suffix}`, `${dbPath}.corrupt-${stamp}${suffix}`);
      if (suffix === '') movedMain = true;
    } catch {
      // A `-wal`/`-shm` sidecar may simply not exist; that is not a failure. The main file failing to
      // move IS — handled below.
    }
  }
  if (!movedMain) {
    Logger.error('Could not quarantine the unreadable database — persistence disabled this session');
    return null;
  }

  try {
    const fresh = openDatabase(dbPath);
    migrate(fresh);
    profileResetKeptFile = `tepegoz.db.corrupt-${stamp}`;
    Logger.warn('Started a fresh profile database; the previous file was kept', {
      kept: profileResetKeptFile,
    });
    return fresh;
  } catch (err) {
    Logger.error('The fresh database also failed to open — persistence disabled this session', {
      err: String(err),
    });
    return null;
  }
}

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
  const opened = openWithRepair(dbPath);
  if (opened !== null) {
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
        // And the agent console's own history (migration 18) — the third store with the same columns.
        const conversationsRefolded = AgentConversationStore.reindexFoldsIfStale(opened);
        if (conversationsRefolded > 0) {
          Logger.info('Re-folded agent conversation search index', { rows: conversationsRefolded });
        }
        // Startup retention pass — history is otherwise unbounded (one row per unique URL, forever).
        const pruned = HistoryStore.prune(opened, Date.now());
        if (pruned > 0) Logger.info('Pruned expired history entries', { pruned });
      } catch (err) {
        Logger.warn('Deferred history maintenance failed', { err: String(err) });
      }
    });
  } else {
    // `openWithRepair` already logged the cause. Callers all treat `getDb() === null` as
    // "persistence off" and no-op, so the browser still runs — just without history/journal/bookmarks.
    db = null;
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
