import { randomUUID } from 'node:crypto';
import type { Db } from './db';

// Bookmark-tree seed constants — kept as literals here (persistence must not depend on @tepegoz/bookmarks).
// These mirror BOOKMARK_ROOT_BAR / BOOKMARK_ROOT_OTHER / the position gap in @tepegoz/bookmarks (single
// canonical source lives there; this is a one-time DDL seed).
const ROOT_BAR = 'root-bar';
const ROOT_OTHER = 'root-other';
const POSITION_GAP = 1000;

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
  {
    version: 3,
    up: (db) => {
      db.exec(`
        -- Bookmarks: one row per URL (re-bookmarking refreshes the title via UNIQUE(url) upsert).
        -- Newest-first listing uses idx_bookmarks_ts.
        CREATE TABLE bookmarks (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          url   TEXT NOT NULL,
          title TEXT NOT NULL,
          ts    INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX idx_bookmarks_url ON bookmarks (url);
        CREATE INDEX idx_bookmarks_ts ON bookmarks (ts);
      `);
    },
  },
  {
    version: 4,
    up: (db) => {
      db.exec(`
        -- Encrypted login credentials for the password manager. Passwords are stored as
        -- base64(safeStorage.encryptString(plain)) — the OS keychain (DPAPI on Windows) must be
        -- available to decrypt them. Raw passwords never leave the main process.
        CREATE TABLE login_credentials (
          id           TEXT PRIMARY KEY,
          url          TEXT NOT NULL,
          username     TEXT NOT NULL,
          title        TEXT NOT NULL DEFAULT '',
          notes        TEXT NOT NULL DEFAULT '',
          encrypted_pw TEXT NOT NULL,
          provider_id  TEXT NOT NULL DEFAULT 'local',
          created_at   INTEGER NOT NULL,
          updated_at   INTEGER NOT NULL
        );
        CREATE INDEX idx_credentials_url ON login_credentials (url);
        CREATE UNIQUE INDEX idx_credentials_url_username ON login_credentials (url, username);
      `);
    },
  },
  {
    version: 5,
    up: (db) => {
      db.exec(`
        -- Saved macros (ext-macros): user-authored deterministic automation scripts. The full IR is
        -- stored as JSON in \`ir\`; attached CSV data lives in the content-addressed \`blobs\` table and
        -- is referenced by hash from the IR (no CSV inline in this row).
        CREATE TABLE macros (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          ir         TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_macros_updated ON macros (updated_at);
      `);
    },
  },
  {
    version: 6,
    up: (db) => {
      // Bookmark TREE (folders + bookmarks in one self-referential table, Chrome-style). `foreign_keys`
      // is ON (db.ts), so ON DELETE CASCADE gives recursive folder delete for free. `position` is a
      // sparse rank within a parent (gap 1000) — reads sort by (parent_id, position); never assume it is
      // contiguous. The old flat `bookmarks` table is migrated into the Bar root and dropped.
      db.exec(`
        CREATE TABLE bookmark_nodes (
          id         TEXT PRIMARY KEY,
          parent_id  TEXT REFERENCES bookmark_nodes(id) ON DELETE CASCADE,
          node_type  TEXT NOT NULL CHECK (node_type IN ('folder', 'bookmark')),
          title      TEXT NOT NULL,
          url        TEXT,
          position   INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          CHECK ((node_type = 'folder') = (url IS NULL))
        );
        CREATE INDEX idx_bmnodes_parent_pos ON bookmark_nodes (parent_id, position);
        CREATE INDEX idx_bmnodes_url ON bookmark_nodes (url);
      `);

      const now = Date.now();
      const insertNode = db.prepare(
        `INSERT INTO bookmark_nodes (id, parent_id, node_type, title, url, position, created_at, updated_at)
         VALUES (@id, @parentId, @nodeType, @title, @url, @position, @createdAt, @updatedAt)`,
      );
      // Two fixed roots (deterministic ids so code references them by constant; UI relabels via i18n).
      insertNode.run({
        id: ROOT_BAR, parentId: null, nodeType: 'folder', title: 'Bookmarks bar',
        url: null, position: 0, createdAt: now, updatedAt: now,
      });
      insertNode.run({
        id: ROOT_OTHER, parentId: null, nodeType: 'folder', title: 'Other bookmarks',
        url: null, position: POSITION_GAP, createdAt: now, updatedAt: now,
      });

      // Migrate the existing flat bookmarks into the Bar root, preserving order (oldest → first).
      const flat = db
        .prepare('SELECT url, title, ts FROM bookmarks ORDER BY ts ASC')
        .all() as { url: string; title: string; ts: number }[];
      flat.forEach((b, i) => {
        insertNode.run({
          id: randomUUID(), parentId: ROOT_BAR, nodeType: 'bookmark',
          title: b.title, url: b.url, position: i * POSITION_GAP,
          createdAt: b.ts, updatedAt: b.ts,
        });
      });

      db.exec('DROP TABLE bookmarks;');
    },
  },
  {
    version: 7,
    up: (db) => {
      // Persist the page favicon captured when a bookmark is added (http(s)/data: URL), so the bar and
      // manager can show it without a fresh network fetch. Nullable — folders and pre-existing bookmarks
      // have none until re-saved.
      db.exec('ALTER TABLE bookmark_nodes ADD COLUMN favicon TEXT;');
    },
  },
];

/**
 * Apply all pending migrations inside a transaction (migration-safe: forward-only, versioned via
 * PRAGMA user_version). Returns the resulting schema version.
 */
export function migrate(db: Db): number {
  const current = userVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  const run = db.transaction(() => {
    for (const m of pending) {
      m.up(db);
      db.pragma(`user_version = ${String(m.version)}`);
    }
  });
  run();
  return userVersion(db);
}
