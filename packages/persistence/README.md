# @tepegoz/persistence (L1)

Local-first persistence: the **append-only Event Journal** (single source of truth), a
**content-addressed blob store**, forward-only migrations, and local meta. SQLite via better-sqlite3
(WAL). See ADR-0003 / ADR-0004.

## Exports
- `openDatabase(path)` — `':memory:'` for tests; WAL + `synchronous=NORMAL`.
- `migrate(db)` — forward-only, transactional, `PRAGMA user_version`.
- `EventJournal.append/readFrom/count` — immutable events; monotonic `lsn`; `deviceId` sync key.
- `BlobStore.put/get/count` — sha256, deduped; returns `cas://<hash>` (journal never stores base64).
- `MetaStore.get/set/deviceId` — stable per-install device id.

## Notes
- Native module: rebuilt per-OS in CI / via electron-builder for the Electron ABI; Node prebuilt under tests.
- Tables carry **day-0 sync-meta** (`updated_at`/`version`/`tombstone` on `kv`; `device_id` on events).

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
