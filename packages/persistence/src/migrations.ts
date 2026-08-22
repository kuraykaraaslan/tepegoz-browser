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

/** Contain the `unknown` pragma return in one typed place. */
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
        id: ROOT_BAR,
        parentId: null,
        nodeType: 'folder',
        title: 'Bookmarks bar',
        url: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });
      insertNode.run({
        id: ROOT_OTHER,
        parentId: null,
        nodeType: 'folder',
        title: 'Other bookmarks',
        url: null,
        position: POSITION_GAP,
        createdAt: now,
        updatedAt: now,
      });

      // Migrate the existing flat bookmarks into the Bar root, preserving order (oldest → first).
      const flat = db.prepare('SELECT url, title, ts FROM bookmarks ORDER BY ts ASC').all() as {
        url: string;
        title: string;
        ts: number;
      }[];
      flat.forEach((b, i) => {
        insertNode.run({
          id: randomUUID(),
          parentId: ROOT_BAR,
          nodeType: 'bookmark',
          title: b.title,
          url: b.url,
          position: i * POSITION_GAP,
          createdAt: b.ts,
          updatedAt: b.ts,
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
  {
    version: 8,
    up: (db) => {
      db.exec(`
        -- Browser download projection. Paths are local-only operational state for release/open/reveal;
        -- Event Journal entries stay redacted and never store paths.
        CREATE TABLE downloads (
          id              TEXT PRIMARY KEY,
          url             TEXT NOT NULL,
          filename        TEXT NOT NULL,
          mime_type       TEXT,
          status          TEXT NOT NULL,
          risk            TEXT NOT NULL,
          trust_verdict   TEXT NOT NULL,
          received_bytes  INTEGER NOT NULL,
          total_bytes     INTEGER,
          can_resume      INTEGER NOT NULL,
          created_at      INTEGER NOT NULL,
          updated_at      INTEGER NOT NULL,
          completed_at    INTEGER,
          error           TEXT,
          sha256          TEXT,
          actor           TEXT NOT NULL,
          source_url      TEXT,
          source_origin   TEXT,
          correlation_id  TEXT,
          task_id         TEXT,
          quarantine_path TEXT,
          final_path      TEXT
        );
        CREATE INDEX idx_downloads_updated ON downloads (updated_at DESC);
        CREATE INDEX idx_downloads_status ON downloads (status);
      `);
    },
  },
  {
    version: 9,
    up: (db) => {
      db.exec(`
        -- Saved agent tasks (code-claude Faz 3): task definitions are local projections over the
        -- Event Journal. Trigger and policy JSON is validated at the IPC/service boundary.
        CREATE TABLE tasks (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          prompt        TEXT NOT NULL,
          description   TEXT,
          status        TEXT NOT NULL,
          triggers      TEXT NOT NULL,
          policy        TEXT NOT NULL,
          target_url    TEXT,
          target_origin TEXT,
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL,
          last_run_at   INTEGER,
          next_run_at   INTEGER
        );
        CREATE INDEX idx_tasks_status_next ON tasks (status, next_run_at);
        CREATE INDEX idx_tasks_updated ON tasks (updated_at DESC);

        CREATE TABLE task_runs (
          id             TEXT PRIMARY KEY,
          task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          correlation_id TEXT NOT NULL,
          trigger_type   TEXT NOT NULL,
          trigger_source TEXT,
          status         TEXT NOT NULL,
          queued_at      INTEGER NOT NULL,
          started_at     INTEGER,
          completed_at   INTEGER,
          summary        TEXT,
          error          TEXT
        );
        CREATE INDEX idx_task_runs_task ON task_runs (task_id, queued_at DESC);
        CREATE INDEX idx_task_runs_status ON task_runs (status);

        CREATE TABLE task_artifacts (
          id         TEXT PRIMARY KEY,
          task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          run_id     TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
          kind       TEXT NOT NULL,
          title      TEXT NOT NULL,
          summary    TEXT,
          mime_type  TEXT,
          blob_ref   TEXT,
          path       TEXT,
          url        TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_task_artifacts_task ON task_artifacts (task_id, created_at DESC);
        CREATE INDEX idx_task_artifacts_run ON task_artifacts (run_id);

        CREATE TABLE task_trigger_state (
          task_id          TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          trigger_key      TEXT NOT NULL,
          last_checked_at  INTEGER,
          last_fired_at    INTEGER,
          next_check_at    INTEGER,
          baseline_hash    TEXT,
          baseline_preview TEXT,
          error            TEXT,
          PRIMARY KEY (task_id, trigger_key)
        );
        CREATE INDEX idx_task_trigger_due ON task_trigger_state (next_check_at);
      `);
    },
  },
  {
    version: 10,
    up: (db) => {
      db.exec(`
        -- Agent Console conversation history. Full content is local-profile only; Event Journal keeps
        -- redacted audit events and does not mirror these rows.
        CREATE TABLE agent_conversations (
          id          TEXT PRIMARY KEY,
          group_id    TEXT NOT NULL,
          title       TEXT NOT NULL,
          preview     TEXT NOT NULL,
          status      TEXT NOT NULL,
          turn_count  INTEGER NOT NULL DEFAULT 0,
          started_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL,
          last_run_id TEXT
        );
        CREATE INDEX idx_agent_conversations_updated ON agent_conversations (updated_at DESC);
        CREATE INDEX idx_agent_conversations_group ON agent_conversations (group_id);

        CREATE TABLE agent_conversation_turns (
          id               TEXT PRIMARY KEY,
          conversation_id  TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
          run_id           TEXT,
          prompt           TEXT NOT NULL,
          response_summary TEXT,
          status           TEXT NOT NULL,
          events_json      TEXT NOT NULL,
          attachments_json TEXT NOT NULL,
          created_at       INTEGER NOT NULL,
          updated_at       INTEGER NOT NULL
        );
        CREATE INDEX idx_agent_turns_conversation ON agent_conversation_turns (
          conversation_id,
          created_at ASC
        );
      `);
    },
  },
  {
    version: 11,
    up: (db) => {
      // Link a saved task back to the agent conversation it was converted from (traceability +
      // re-convert-in-place). Additive column; existing rows read back as NULL → undefined.
      db.exec('ALTER TABLE tasks ADD COLUMN source_conversation_id TEXT;');
    },
  },
  {
    version: 12,
    up: (db) => {
      db.exec(`
        -- Token Ledger (L7): persisted model-usage accounting at provider+model+capability granularity.
        -- One row per (run, provider, model, capability); the live in-memory ledger feeds the run and
        -- these rows are the cross-restart lifetime total behind the quota indicator + 80% warning.
        --
        -- 'refunded' rows are excluded from the quota total (auto-refund on system-error/CAPTCHA/loop —
        -- the user's budget is not spent when a run fails for reasons outside their control).
        --
        -- Sync-ready from day 0 (mirrors the 'kv' table): a UUID primary key (not an autoincrement rowid
        -- that would collide across devices), 'device_id' for per-device accounting that aggregates under
        -- one tepegoz account later, and updated_at/version/tombstone sync-meta — so Phase 3 account cloud
        -- sync is NOT a schema migration.
        CREATE TABLE token_usage (
          id             TEXT PRIMARY KEY,
          ts             INTEGER NOT NULL,
          device_id      TEXT NOT NULL,
          correlation_id TEXT,
          provider       TEXT NOT NULL,
          model          TEXT NOT NULL,
          capability     TEXT NOT NULL,
          input_tokens   INTEGER NOT NULL,
          output_tokens  INTEGER NOT NULL,
          calls          INTEGER NOT NULL,
          refunded       INTEGER NOT NULL DEFAULT 0,
          updated_at     INTEGER NOT NULL,
          version        INTEGER NOT NULL DEFAULT 1,
          tombstone      INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_token_usage_ts ON token_usage (ts DESC);
        CREATE INDEX idx_token_usage_corr ON token_usage (correlation_id);
      `);
    },
  },
  {
    version: 13,
    up: (db) => {
      // S9 — cross-run agent memory, skills, and remembered grants.
      //
      // All three carry sync-meta from day 0 (UUID PK, device_id, updated_at, version, tombstone) so
      // Phase-3 sync owes no migration. Deletes are SOFT: on a syncing store, a hard delete on one
      // device is indistinguishable from a row that simply has not arrived yet.
      //
      // `quarantined` is deliberately separate from `tombstone`. A hint that led to a policy denial
      // stops being offered but STAYS — so a user, or a later investigation, can still see what was
      // planted and when. Deleting it would erase the evidence of the attack along with the attack.
      db.exec(`
        CREATE TABLE agent_domain_memory (
          id              TEXT PRIMARY KEY,
          host            TEXT NOT NULL,
          note            TEXT NOT NULL,
          descriptor_json TEXT,
          provenance      TEXT NOT NULL CHECK (provenance IN ('page', 'run')),
          quarantined     INTEGER NOT NULL DEFAULT 0,
          device_id       TEXT NOT NULL,
          updated_at      INTEGER NOT NULL,
          version         INTEGER NOT NULL DEFAULT 1,
          tombstone       INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_agent_memory_host ON agent_domain_memory (host, tombstone, updated_at DESC);

        -- A skill is a model-driven TEMPLATE (prompt + start url + expected grant profile), not a
        -- Phase-6 signed recipe: launching one runs the ordinary reactor loop over a live page.
        CREATE TABLE agent_skills (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          prompt        TEXT NOT NULL,
          start_url     TEXT,
          grant_profile TEXT,
          device_id     TEXT NOT NULL,
          updated_at    INTEGER NOT NULL,
          version       INTEGER NOT NULL DEFAULT 1,
          tombstone     INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_agent_skills_name ON agent_skills (tombstone, name);

        -- Remembered S6 grants. expires_at is NOT NULL by design: a grant without an expiry is
        -- silent autonomy creep, and the tier CHECK keeps credential/financial/destructive out
        -- entirely — those are never remembered, only ever asked.
        CREATE TABLE agent_remembered_grants (
          id         TEXT PRIMARY KEY,
          scope      TEXT NOT NULL,
          host       TEXT NOT NULL,
          tier       TEXT NOT NULL CHECK (tier IN ('read', 'ui-write', 'data-egress')),
          expires_at INTEGER NOT NULL,
          device_id  TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          version    INTEGER NOT NULL DEFAULT 1,
          tombstone  INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_agent_grants_scope ON agent_remembered_grants (scope, host, tombstone, expires_at);
      `);
    },
  },
  {
    version: 14,
    up: (db) => {
      db.exec(`
        -- Scoped Trust Profiles: the standing posture a user sets for a site, in advance.
        --
        -- \`domain\` is UNIQUE rather than the primary key: the key is a UUID so the row can be synced,
        -- but two live profiles for one site would make "which one is in force" an ordering accident,
        -- and for a permission record that is the difference between restricted and trusted. The
        -- CHECK keeps the level a closed set at the storage layer too, so a hand-edited database
        -- cannot introduce a level the code has no branch for.
        CREATE TABLE trust_profiles (
          id         TEXT PRIMARY KEY,
          domain     TEXT NOT NULL UNIQUE,
          level      TEXT NOT NULL CHECK (level IN ('trusted', 'default', 'restricted')),
          device_id  TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          version    INTEGER NOT NULL DEFAULT 1,
          tombstone  INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_trust_profiles_live ON trust_profiles (tombstone, domain);
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
