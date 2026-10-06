import type { Migration } from './types';

/** Schema versions 11–20: token ledger, agent memory/skills/grants, trust profiles, bookmark tags, Turkish-aware search folds, download resume metadata, history favicon. */
export const MIGRATIONS_V11_V20: Migration[] = [
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
  {
    version: 15,
    up: (db) => {
      db.exec(`
        -- Bookmark tags. A junction table, not a comma-joined column on \`bookmark_nodes\`: a joined
        -- string cannot be indexed, cannot be searched without LIKE matching across tag boundaries
        -- ("work" finding "homework"), and turns renaming a tag into a string rewrite of every row.
        --
        -- Two columns for one tag, on purpose. \`tag\` is what the user typed and what is displayed;
        -- \`tag_key\` is the case-folded form and is what uniqueness and lookup use, so "Work" and
        -- "work" are one tag on a bookmark rather than two. Folding in the WRITER rather than with
        -- SQLite's LOWER() is deliberate — LOWER() is ASCII-only, so it would leave every Turkish
        -- tag unfolded in a product whose second language is Turkish.
        --
        -- ON DELETE CASCADE mirrors what \`bookmark_nodes\` already does for its own children: deleting
        -- a bookmark must not leave its tags behind to be counted by the tag list forever.
        CREATE TABLE bookmark_tags (
          node_id TEXT NOT NULL REFERENCES bookmark_nodes(id) ON DELETE CASCADE,
          tag     TEXT NOT NULL,
          tag_key TEXT NOT NULL,
          PRIMARY KEY (node_id, tag_key)
        );
        CREATE INDEX idx_bookmark_tags_key ON bookmark_tags (tag_key);
      `);
    },
  },
  {
    version: 16,
    up: (db) => {
      // Turkish history search was broken end to end: `HistoryStore.search` was
      // 'WHERE url LIKE ? OR title LIKE ?', and SQLite's built-in LIKE case-folds ASCII only — so a
      // page the user titled "Şişli Gezisi" could not be found by typing "şişli", nor "sisli". Store
      // a case-folded shadow of each searchable field, folded in the WRITER with foldForSearch (the
      // omnibox's rule: collapses the dotted/dotless i family and strips accents), exactly the choice
      // `bookmark_tags.tag_key` makes for the same reason (v15). Never SQLite LOWER().
      //
      // DDL only. Existing rows are backfilled by HistoryStore.reindexFoldsIfStale at the next
      // startup (the meta key it checks is unset here); that function also owns re-folding after a
      // HISTORY_FOLD_VERSION bump, so there is one code path for both.
      db.exec(`
        ALTER TABLE history ADD COLUMN url_fold   TEXT NOT NULL DEFAULT '';
        ALTER TABLE history ADD COLUMN title_fold TEXT NOT NULL DEFAULT '';
        CREATE INDEX idx_history_title_fold ON history (title_fold);
        CREATE INDEX idx_history_url_fold ON history (url_fold);
      `);
    },
  },
  {
    version: 17,
    up: (db) => {
      // The same bug as v16, in the store v16 did not reach. `BookmarkTreeStore.search` was
      // 'WHERE url LIKE ? OR title LIKE ? OR tag_key LIKE ?', and SQLite's LIKE folds ASCII only —
      // so a bookmark titled "İSTANBUL Gezisi" was unreachable by typing "istanbul", and "ISPARTA"
      // by typing "ısparta". The bookmarks MANAGER had already been fixed at the surface (it filters
      // the loaded tree in the renderer with foldForSearch), which is exactly what hid this: the
      // visible search worked, so the store underneath it was never suspected.
      //
      // `tag_fold` sits BESIDE `tag_key` rather than replacing it, because the two answer different
      // questions and folding them together would be wrong. `tag_key` is IDENTITY — it decides
      // whether "Work" and "work" are one tag — and it must not strip accents, or "is" and "iş"
      // would become the same tag. `tag_fold` is SEARCH, where collapsing them is what the user
      // wants: nobody reliably types `ı` vs `i` mid-search.
      //
      // DDL only, like v16. Existing rows are backfilled by BookmarkTreeStore.reindexFoldsIfStale at
      // the next startup, which also owns re-folding after a BOOKMARK_FOLD_VERSION bump.
      db.exec(`
        ALTER TABLE bookmark_nodes ADD COLUMN title_fold TEXT NOT NULL DEFAULT '';
        ALTER TABLE bookmark_nodes ADD COLUMN url_fold   TEXT NOT NULL DEFAULT '';
        ALTER TABLE bookmark_tags  ADD COLUMN tag_fold   TEXT NOT NULL DEFAULT '';
        CREATE INDEX idx_bmnodes_title_fold ON bookmark_nodes (title_fold);
        CREATE INDEX idx_bmnodes_url_fold ON bookmark_nodes (url_fold);
        CREATE INDEX idx_bookmark_tags_fold ON bookmark_tags (tag_fold);
      `);
    },
  },
  {
    version: 18,
    up: (db) => {
      // The third and last instance of the v16/v17 defect, found by grepping the repo for `LIKE ?`
      // rather than by waiting for it to be reported. `AgentConversationStore.list` searched
      // 'c.title LIKE ? OR c.preview LIKE ? OR t.prompt LIKE ? OR t.response_summary LIKE ?' — over
      // text the user typed AT AN AGENT, which in this product is Turkish more often than anywhere
      // else in the app. It also had no ESCAPE clause at all, so a query containing `%` matched every
      // conversation (omnibox track A3, unfixed here).
      //
      // Same shape as 16 and 17: folded shadow columns written by the WRITER, backfilled by
      // AgentConversationStore.reindexFoldsIfStale at the next startup.
      db.exec(`
        ALTER TABLE agent_conversations ADD COLUMN title_fold   TEXT NOT NULL DEFAULT '';
        ALTER TABLE agent_conversations ADD COLUMN preview_fold TEXT NOT NULL DEFAULT '';
        ALTER TABLE agent_conversation_turns ADD COLUMN prompt_fold   TEXT NOT NULL DEFAULT '';
        ALTER TABLE agent_conversation_turns ADD COLUMN response_fold TEXT NOT NULL DEFAULT '';
        CREATE INDEX idx_agent_conversations_title_fold ON agent_conversations (title_fold);
        CREATE INDEX idx_agent_turns_prompt_fold ON agent_conversation_turns (prompt_fold);
      `);
    },
  },
  {
    version: 19,
    up: (db) => {
      // Resuming a transfer across an app RESTART needs three things Electron asks for and this app
      // was not keeping: the URL chain (redirects included — resuming the first URL can land
      // somewhere else), and the server's validators.
      //
      // `partition` is the fourth, and it is a privacy requirement rather than a protocol one. Since
      // Phase 5 a tab can be bound to a VPN/Tor connection with its own partition; resuming such a
      // transfer on the Direct session after a restart would put the request on the clear route the
      // user had deliberately left. `retry` sidesteps this by re-running from the page you are on —
      // a restart-resume has no page, so it has to know.
      //
      // `etag` / `last_modified` are the load-bearing pair. Without one of them a range request still
      // succeeds and still splices bytes from a resource that may have changed underneath — producing
      // a file that is corrupt in a way nothing downstream can detect, because the hash is computed
      // over the splice and merely disagrees with every other copy in the world.
      db.exec(`
        ALTER TABLE downloads ADD COLUMN url_chain     TEXT;
        ALTER TABLE downloads ADD COLUMN etag          TEXT;
        ALTER TABLE downloads ADD COLUMN last_modified TEXT;
        ALTER TABLE downloads ADD COLUMN partition     TEXT;
      `);
    },
  },
  {
    version: 20,
    up: (db) => {
      // Persist the page favicon captured on a visit, as an inline `data:` URL (the same bytes the
      // tab strip shows — fetched by main on the page's own session, `tabs-favicon.electron.ts`).
      // The omnibox's history rows can then show the site's icon instead of a generic clock glyph,
      // and because it is already a `data:` URL the trusted chrome renders it with no network
      // request. Nullable, no backfill: a row written before this migration gets its icon the next
      // time the page is visited. `bookmark_nodes.favicon` is the bookmark-side equivalent.
      db.exec('ALTER TABLE history ADD COLUMN favicon TEXT;');
    },
  },
];
