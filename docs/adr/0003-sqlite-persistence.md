# ADR-0003: SQLite (better-sqlite3 + FTS5 + sqlite-vec) for L1 persistence

- **Status:** Accepted
- **Date:** 2026-06-30

## Context

Local-first storage for the Event Journal, per-task memory (full-text + vector retrieval), blobs and
settings. Must be embedded, fast, single-file, privacy-friendly (no external service).

## Decision

**better-sqlite3** (synchronous API, WAL, `synchronous=NORMAL`) with **FTS5** (BM25) and
**sqlite-vec** (vector) for hybrid retrieval. Single-file DB in the app userData dir. Forward-only,
transactional migrations keyed by `PRAGMA user_version`.

## Consequences

- Synchronous API simplifies main-process code; WAL gives durability without per-write fsync.
- Native module → rebuilt per-OS in CI / via electron-builder for the Electron ABI; under Node
  (tests) it uses the prebuilt.
- **sqlite-vec is brute-force** (no ANN); at GB scale a per-task store switches to a real ANN index
  (hnswlib/LanceDB) above a measured threshold (Phase 1b).
