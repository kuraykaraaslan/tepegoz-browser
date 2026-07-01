import type { Db } from './db';

interface Migration {
  version: number;
  up: (db: Db) => void;
}

/** Contain better-sqlite3's `any` pragma return in one typed place. */
function userVersion(db: Db): number {
  const v: unknown = db.pragma('user_version', { simple: true });
  return typeof v === 'number' ? v : 0;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        -- Append-only Event Journal (single source of truth). Immutable; sync key = (device_id, lsn).
        CREATE TABLE events (
          lsn            INTEGER PRIMARY KEY AUTOINCREMENT,
          id             TEXT NOT NULL UNIQUE,
          type           TEXT NOT NULL,
          ts             INTEGER NOT NULL,
          actor          TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          payload        TEXT NOT NULL,
          blob_ref       TEXT,
          redacted       INTEGER NOT NULL,
          device_id      TEXT NOT NULL
        );
        CREATE INDEX idx_events_correlation ON events (correlation_id);

        -- Content-addressed blob store (screenshots/DOM/HAR). base64 is NEVER stored in the journal.
        CREATE TABLE blobs (
          hash       TEXT PRIMARY KEY,
          bytes      BLOB NOT NULL,
          size       INTEGER NOT NULL,
          refcount   INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );

        -- Syncable key/value (settings). Carries day-0 sync-meta (updated_at/version/tombstone) so
        -- Phase 3 cloud sync is NOT a schema migration.
        CREATE TABLE kv (
          key        TEXT PRIMARY KEY,
          value      TEXT,
          updated_at INTEGER NOT NULL,
          version    INTEGER NOT NULL DEFAULT 1,
          tombstone  INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
  {
    version: 2,
    up: (db) => {
      db.exec(`
        -- Browsing history: one row per URL (visits coalesced via UNIQUE(url) upsert). Newest-first
        -- listing uses idx_history_ts.
        CREATE TABLE history (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          url         TEXT NOT NULL,
          title       TEXT NOT NULL,
          ts          INTEGER NOT NULL,
          visit_count INTEGER NOT NULL DEFAULT 1
        );
        CREATE UNIQUE INDEX idx_history_url ON history (url);
        CREATE INDEX idx_history_ts ON history (ts);

        -- Installed (third-party) extensions on disk under Extensions/. Scaffold; real install is a
        -- later phase (MV3). Built-in extension state stays in preferences for now.
        CREATE TABLE installed_extensions (
          id      TEXT PRIMARY KEY,
          name    TEXT NOT NULL,
          version TEXT NOT NULL,
          path    TEXT NOT NULL,
          status  TEXT NOT NULL DEFAULT 'enabled'
        );
      `);
    },
  },
];

/**
 * Apply all pending migrations inside a transaction (migration-safe: forward-only, versioned via
 * PRAGMA user_version). Returns the resulting schema version.
 */
export function migrate(db: Db): number {
  const current = userVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  const run = db.transaction(() => {
    for (const m of pending) {
      m.up(db);
      db.pragma(`user_version = ${String(m.version)}`);
    }
  });
  run();
  return userVersion(db);
}
