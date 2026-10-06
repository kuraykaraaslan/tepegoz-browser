import { MetaStore } from '../meta';
import type { Migration } from './types';

/**
 * Fixed ids for the built-in skill templates seeded by migration 27 (S9 PR4) — generated once, hardcoded
 * here rather than derived, so re-running this migration is meaningless (it never runs twice) and a
 * FUTURE migration that wants to touch one of these specific rows (rename, retire) has a stable id to
 * reference instead of matching on name text.
 */
const BUILTIN_SKILL_SUMMARIZE_PAGE = '0ef8976d-82ac-474c-b67a-125fa07888a6';
const BUILTIN_SKILL_PDF_TABLE = '4bc3d37b-fdb5-4e09-b7d4-feaec2484caa';
const BUILTIN_SKILL_YOUTUBE_SUMMARY = '2f469308-bb88-47b1-b687-a70ba0f3f45b';
const BUILTIN_SKILL_PRICE_WATCH = '1bc4e044-46c2-4d6c-8dd3-f3903abde785';
const BUILTIN_SKILL_FIYAT_TAKIBI_TR = 'f3deafbe-e625-4836-8f21-5b5fbb02e590';
const BUILTIN_SKILL_ILAN_OZETI_TR = 'fb634f5a-d47f-4131-a65d-8c4c50c732b9';

/** Schema versions 21–27: ext-chat tables and columns, the events hash-chain columns, and the seeded built-in skill templates. */
export const MIGRATIONS_V21_V27: Migration[] = [
  {
    version: 21,
    up: (db) => {
      // Multi-protocol messenger (`@tepegoz/ext-chat`, phase X-chat.1). Profile-scoped like every
      // other store. `chat_accounts` carries sync-meta (updated_at/version/tombstone) from day 0 so
      // Phase-3 account sync owes no migration. NO key material anywhere here: `secret_ref` is a
      // vault key; `chat_e2ee_sessions.wrapped_blob` is safeStorage-wrapped, never plaintext.
      //
      // `chat_messages` is deduped by (conversation_id, protocol_id) — the wire id — so a
      // re-delivered stanza / re-synced Matrix event updates in place instead of duplicating.
      // `body_fold` is the Turkish-aware search fold (never SQLite LOWER(); migrations v16–v18 record
      // why). FTS5 is created here but populated by the sync engine's writer, not a trigger, so the
      // fold and the FTS row stay in one code path.
      db.exec(`
        CREATE TABLE chat_accounts (
          id           TEXT PRIMARY KEY,
          label        TEXT NOT NULL,
          protocol     TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT '',
          server_json  TEXT NOT NULL,
          secret_ref   TEXT NOT NULL,
          color        TEXT,
          "order"      INTEGER NOT NULL DEFAULT 0,
          updated_at   INTEGER NOT NULL,
          version      INTEGER NOT NULL DEFAULT 1,
          tombstone    INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE chat_contacts (
          id           TEXT PRIMARY KEY,
          account_id   TEXT NOT NULL REFERENCES chat_accounts(id) ON DELETE CASCADE,
          address      TEXT NOT NULL,
          name         TEXT NOT NULL DEFAULT '',
          groups_json  TEXT NOT NULL DEFAULT '[]',
          presence     TEXT NOT NULL DEFAULT 'offline',
          status_text  TEXT NOT NULL DEFAULT '',
          subscription TEXT NOT NULL DEFAULT 'none',
          UNIQUE (account_id, address)
        );

        CREATE TABLE chat_conversations (
          id               TEXT PRIMARY KEY,
          account_id       TEXT NOT NULL REFERENCES chat_accounts(id) ON DELETE CASCADE,
          kind             TEXT NOT NULL,
          address          TEXT NOT NULL,
          name             TEXT NOT NULL DEFAULT '',
          topic            TEXT NOT NULL DEFAULT '',
          member_count     INTEGER NOT NULL DEFAULT 0,
          unread           INTEGER NOT NULL DEFAULT 0,
          mentions         INTEGER NOT NULL DEFAULT 0,
          last_read_id     TEXT,
          muted            INTEGER NOT NULL DEFAULT 0,
          is_known_contact INTEGER NOT NULL DEFAULT 0,
          updated_at       INTEGER NOT NULL,
          UNIQUE (account_id, address)
        );
        CREATE INDEX idx_chat_conv_recent ON chat_conversations (account_id, updated_at DESC);

        CREATE TABLE chat_messages (
          id             TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
          account_id     TEXT NOT NULL,
          protocol_id    TEXT NOT NULL,
          sender_address TEXT NOT NULL,
          sender_name    TEXT NOT NULL DEFAULT '',
          kind           TEXT NOT NULL DEFAULT 'text',
          body           TEXT NOT NULL DEFAULT '',
          body_fold      TEXT NOT NULL DEFAULT '',
          media_ref      TEXT,
          reply_to_id    TEXT,
          reactions_json TEXT NOT NULL DEFAULT '[]',
          edited_at      INTEGER,
          redacted       INTEGER NOT NULL DEFAULT 0,
          origin_ts      INTEGER NOT NULL,
          received_at    INTEGER NOT NULL,
          delivery_state TEXT NOT NULL DEFAULT 'delivered',
          UNIQUE (conversation_id, protocol_id)
        );
        CREATE INDEX idx_chat_messages_conv ON chat_messages (conversation_id, origin_ts DESC);

        CREATE TABLE chat_attachments (
          id         TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
          filename   TEXT NOT NULL DEFAULT '',
          mime_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
          size       INTEGER NOT NULL DEFAULT 0,
          blob_ref   TEXT,
          quarantine TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE TABLE chat_receipts (
          conversation_id TEXT NOT NULL,
          message_id      TEXT NOT NULL,
          by_address      TEXT NOT NULL,
          kind            TEXT NOT NULL,
          ts              INTEGER NOT NULL,
          PRIMARY KEY (conversation_id, message_id, by_address, kind)
        );

        CREATE TABLE chat_e2ee_sessions (
          account_id   TEXT NOT NULL,
          peer         TEXT NOT NULL,
          device       TEXT NOT NULL,
          wrapped_blob TEXT NOT NULL,
          trust        TEXT NOT NULL DEFAULT 'untrusted',
          updated_at   INTEGER NOT NULL,
          PRIMARY KEY (account_id, peer, device)
        );

        CREATE TABLE chat_send_queue (
          id              TEXT PRIMARY KEY,
          account_id      TEXT NOT NULL,
          conversation_id TEXT NOT NULL,
          body_json       TEXT NOT NULL,
          status          TEXT NOT NULL,
          attempts        INTEGER NOT NULL DEFAULT 0,
          last_error      TEXT,
          retry_after     INTEGER NOT NULL DEFAULT 0,
          created_at      INTEGER NOT NULL,
          updated_at      INTEGER NOT NULL
        );

        CREATE VIRTUAL TABLE chat_search USING fts5 (
          message_id UNINDEXED,
          body,
          sender,
          tokenize = 'unicode61 remove_diacritics 2'
        );
      `);
    },
  },
  {
    version: 22,
    up: (db) => {
      // Per-room notification level (ext-chat X-chat.3): `all` (default) | `mentions` | `none`.
      // A direct nick mention still notifies at `mentions`; only `none` fully silences — the routing
      // rule lives in `@tepegoz/chat-core` `decideNotification`. DMs keep using `muted`.
      db.exec(
        "ALTER TABLE chat_conversations ADD COLUMN notify_level TEXT NOT NULL DEFAULT 'all';",
      );
    },
  },
  {
    version: 23,
    up: (db) => {
      // ext-chat X-chat.10 perf: back message search with the FTS5 index migration 21 created but
      // nothing populated (`ChatStore.searchMessages` still LIKE-scanned `body_fold`). The FTS
      // `body` column holds the SAME Turkish-aware fold as `chat_messages.body_fold` — never the raw
      // body — so a query folded with `foldForSearch` tokenizes identically; `sender` mirrors
      // `sender_name` for a future sender filter. Redacted rows are absent (their fold is '').
      db.exec(`
        INSERT INTO chat_search (message_id, body, sender)
          SELECT id, body_fold, sender_name FROM chat_messages
          WHERE redacted = 0 AND body_fold <> '';

        CREATE TRIGGER chat_search_ad AFTER DELETE ON chat_messages BEGIN
          DELETE FROM chat_search WHERE message_id = old.id;
        END;
      `);
    },
  },
  {
    version: 24,
    up: (db) => {
      // ext-chat: the conversation list's preview row (last message + a timed mute + archive), all
      // added together since they touch the same `chat_conversations` row on the same ingest path.
      // `last_message_json` mirrors `reactions_json`'s convention (a small nested object, not its own
      // table — one row per conversation, no query need finer than "the whole snapshot").
      // `muted_until`: NULL = not timed-muted; a past epoch ms reads as expired (== unmuted), same as
      // `muted = 0` — no separate cleanup job needed, "is muted now" is computed at read time.
      // `muted` (existing column) stays the FOREVER mute; the two are independent so switching from a
      // timed mute to forever (or back) never needs to clear the other first.
      db.exec(`
        ALTER TABLE chat_conversations ADD COLUMN last_message_json TEXT;
        ALTER TABLE chat_conversations ADD COLUMN muted_until INTEGER;
        ALTER TABLE chat_conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
      `);
    },
  },
  {
    version: 25,
    up: (db) => {
      // ext-chat: blocking a contact (XEP-0191, …). Write-through from a successful
      // blockContact/unblockContact call — neither protocol's block state arrives as a normal
      // roster-push, so there is no live event to fold it from.
      db.exec('ALTER TABLE chat_contacts ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;');
    },
  },
  {
    version: 26,
    up: (db) => {
      // Phase 7 NotaryService: the two hash-chain columns the events table has never had (see ADR-0030).
      // NULL, not backfilled: `@tepegoz/notary`'s selfHashOf/chainEvents live in a HIGHER layer than this
      // package (persistence must not depend on notary — dependency-cruiser), so nothing here computes a
      // hash; a caller that wants a chained append supplies both fields already folded. Every row written
      // before that caller exists reads as NULL forever, which is honest: it was never actually chained.
      db.exec(`
        ALTER TABLE events ADD COLUMN prev_hash TEXT;
        ALTER TABLE events ADD COLUMN self_hash TEXT;
      `);
    },
  },
  {
    version: 27,
    up: (db) => {
      // S9 PR4: the skills library shipped with the store, the UI hook, and the launch path — and
      // nothing in it. A user who opened the dropdown found an empty list and had to author the first
      // template themselves, which is the exact "installed, does nothing yet" gap this phase's own rival
      // evidence names. A HANDFUL of good templates, not HARPA's hundred-plus catalogue — every one runs
      // on tools that already ship, none needs a new capability, and each is CONTRIBUTOR-authored trusted
      // text (never generated from page content — PR2/PR3's boundary). Two are Turkish-first rather than
      // translated, because a template that only ever reads as a translation of an English one is not
      // what "Turkish-first" means here.
      //
      // Seeded ONCE, by a migration that never runs twice: `putSkill`'s ON CONFLICT clause does not touch
      // `tombstone`, so a plain one-time INSERT is enough — a user who deletes one of these keeps it
      // deleted forever (no later boot re-seeds it), and a user who edits one keeps their edit, because
      // nothing here ever runs again to overwrite it.
      const now = Date.now();
      const deviceId = MetaStore.deviceId(db);
      const insertSkill = db.prepare(
        `INSERT INTO agent_skills (id, name, prompt, start_url, grant_profile, device_id, updated_at, version, tombstone)
         VALUES (@id, @name, @prompt, @startUrl, @grantProfile, @deviceId, @updatedAt, 1, 0)`,
      );
      const readOnly = 'Read-only';
      insertSkill.run({
        id: BUILTIN_SKILL_SUMMARIZE_PAGE,
        name: 'Summarize this page',
        prompt:
          'Read this page and give me a concise summary as a few bullet points, covering the main ' +
          'points and any key facts or numbers.',
        startUrl: null,
        grantProfile: readOnly,
        deviceId,
        updatedAt: now,
      });
      insertSkill.run({
        id: BUILTIN_SKILL_PDF_TABLE,
        name: 'Pull the table out of this PDF',
        prompt:
          'This tab has a PDF open. Find the main data table on the page, extract it, and present it ' +
          'back to me as a clean markdown table.',
        startUrl: null,
        grantProfile: readOnly,
        deviceId,
        updatedAt: now,
      });
      insertSkill.run({
        id: BUILTIN_SKILL_YOUTUBE_SUMMARY,
        name: 'Summarize this YouTube video',
        prompt:
          "Read this YouTube video's transcript or description and summarize what it covers as a few " +
          'bullet points, including timestamps for the major sections if they are visible on the page.',
        startUrl: null,
        grantProfile: readOnly,
        deviceId,
        updatedAt: now,
      });
      insertSkill.run({
        id: BUILTIN_SKILL_PRICE_WATCH,
        name: 'Tell me when this price drops',
        prompt:
          "This page shows a product. Note the product's current price, then set up a recurring check " +
          'on this same page and let me know as soon as the price drops below what it is now.',
        startUrl: null,
        grantProfile: readOnly,
        deviceId,
        updatedAt: now,
      });
      insertSkill.run({
        id: BUILTIN_SKILL_FIYAT_TAKIBI_TR,
        name: 'Fiyat düşünce haber ver',
        prompt:
          'Bu sayfada bir ürün ilanı görüntüleniyor. Ürünün şu anki fiyatını not al, ardından bu sayfayı ' +
          'düzenli olarak kontrol edecek bir görev oluştur ve fiyat düştüğünde bana haber ver.',
        startUrl: null,
        grantProfile: readOnly,
        deviceId,
        updatedAt: now,
      });
      insertSkill.run({
        id: BUILTIN_SKILL_ILAN_OZETI_TR,
        name: 'Bu ilanı özetle',
        prompt:
          'Bu ilanı oku ve bana kısa maddeler halinde özetle: fiyat, konum, öne çıkan özellikler ve ' +
          'varsa dikkat edilmesi gereken noktalar.',
        startUrl: null,
        grantProfile: readOnly,
        deviceId,
        updatedAt: now,
      });
    },
  },
];
