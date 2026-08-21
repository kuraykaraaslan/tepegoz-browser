import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import { HistoryStore, migrate, openDatabase, type Db } from '@tepegoz/persistence';

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
    migrate(opened);
    // Startup retention pass — history is otherwise unbounded (one row per unique URL, forever).
    const pruned = HistoryStore.prune(opened, Date.now());
    if (pruned > 0) Logger.info('Pruned expired history entries', { pruned });
    db = opened;
    Logger.info('Database ready', { path: dbPath });
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
