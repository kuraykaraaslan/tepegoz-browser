import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import { migrate, openDatabase, type Db } from '@tepegoz/persistence';

/**
 * The single SQLite "DB connector" for the user-data directory (`%APPDATA%/tepegoz/tepegoz.db`): the
 * Event Journal, blob store, kv settings, and browsing history all live here (Chrome keeps its History
 * as SQLite likewise). Opened once after `app.whenReady()`.
 *
 * `better-sqlite3` is a native module that must match the Electron ABI (rebuilt via
 * `pnpm --filter @tepegoz/desktop run rebuild`). If it can't load — e.g. a dev checkout that skipped
 * the rebuild — we log and **degrade gracefully**: `getDb()` returns null and history/journal writes
 * no-op, rather than crashing the whole browser.
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
