# @tepegoz/persistence CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support opening SQLite databases by host-provided path.
- [ ] Support in-memory databases for tests.
- [ ] Support WAL mode for local-first durability.
- [ ] Support synchronous-normal database configuration.
- [ ] Support forward-only migrations.
- [ ] Support transactional migration execution.
- [ ] Support PRAGMA user_version migration tracking.
- [ ] Support append-only event journal writes.
- [ ] Support monotonic log sequence numbers.
- [ ] Support per-install device identifiers in event records.
- [ ] Support reading events from a given sequence number.
- [ ] Support event counts for diagnostics and tests.
- [ ] Support content-addressed blob storage.
- [ ] Support SHA-256 blob identifiers.
- [ ] Support blob deduplication by digest.
- [ ] Support blob retrieval by cas URL.
- [ ] Support avoiding base64 payloads inside journal rows.
- [ ] Support local metadata key-value storage.
- [ ] Support stable device ID generation and retrieval.
- [ ] Support updated-at metadata for sync-friendly records.
- [ ] Support version metadata for sync-friendly records.
- [ ] Support tombstone metadata for deletion synchronization.
- [ ] Support device IDs on event rows for future sync.
- [ ] Support native module rebuilds for Electron ABI targets.
- [ ] Support Node-compatible native module use under tests.
- [ ] Support migration tests across schema versions.
- [ ] Support corruption-safe error behavior for database open failures.
- [ ] Support backup and restore hooks for local-first data.
- [ ] Support vacuum or compaction maintenance hooks.
- [ ] Support future replicated sync without changing journal semantics.
