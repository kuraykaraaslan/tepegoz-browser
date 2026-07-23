# @tepegoz/persistence CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support opening SQLite databases by host-provided path.
- [x] Support in-memory databases for tests.
- [x] Support WAL mode for local-first durability.
- [x] Support synchronous-normal database configuration.
- [x] Support forward-only migrations.
- [x] Support transactional migration execution.
- [x] Support PRAGMA user_version migration tracking.
- [x] Support append-only event journal writes.
- [x] Support monotonic log sequence numbers.
- [x] Support per-install device identifiers in event records.
- [x] Support reading events from a given sequence number.
- [x] Support event counts for diagnostics and tests.
- [x] Support content-addressed blob storage.
- [x] Support SHA-256 blob identifiers.
- [x] Support blob deduplication by digest.
- [x] Support blob retrieval by cas URL.
- [x] Support avoiding base64 payloads inside journal rows.
- [x] Support local metadata key-value storage.
- [x] Support stable device ID generation and retrieval.
- [x] Support updated-at metadata for sync-friendly records.
- [x] Support version metadata for sync-friendly records.
- [x] Support tombstone metadata for deletion synchronization.
- [x] Support device IDs on event rows for future sync.
- [x] Support native module rebuilds for Electron ABI targets.
- [x] Support Node-compatible native module use under tests.
- [ ] Support migration tests across schema versions.
- [x] Support corruption-safe error behavior for database open failures.
- [ ] Support backup and restore hooks for local-first data.
- [ ] Support vacuum or compaction maintenance hooks.
- [ ] Support future replicated sync without changing journal semantics.
