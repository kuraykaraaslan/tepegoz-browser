# ADR-0014: Chrome-like user-data layout + single SQLite DB connector

- **Status:** Accepted
- **Date:** 2026-07-01

## Context
All app state (settings, browsing history, agent journal, extension state, cache) should live in one
Chrome-like user-data directory, with structured data behind a DB connector. The `@tepegoz/persistence`
package (better-sqlite3 + WAL + forward-only migrations + EventJournal/BlobStore/MetaStore + `kv`,
ADR-0003/0004) already existed but was unused by the app.

## Decision
- **One user-data directory, named `tepegoz`**, under the OS roaming app-data dir (`%APPDATA%/tepegoz`
  on Windows). Pinned via `app.setPath('userData', join(app.getPath('appData'), 'tepegoz'))` **before**
  `whenReady` so every `app.getPath('userData')` (stores, DB, Chromium partitions) resolves there.
  `app.setName('Tepegöz')` remains only the display/taskbar name. NOT the home dir (`~/.tepegoz`).
- **One-time carry-over:** on first run, `preferences.json` + `credentials.enc.json` are copied from a
  pre-rename `Tepegöz` folder if present (existing settings + encrypted keys survive; heavy Chromium
  cache is left behind — a fresh cache is fine).
- **Chrome-like mixed layout:** Preferences stay **JSON** (`preferences.json`); API keys stay
  **encrypted JSON** (`credentials.enc.json`, safeStorage/DPAPI); History + agent Event Journal + blobs
  + `kv` are **SQLite** in a single `tepegoz.db`; installed (third-party) extensions get an
  `Extensions/` folder (scaffold). Chromium cache/cookies stay in `Partitions/…` (Electron-managed).
- **Single DB connector:** a main-process `DatabaseService` (`db/database.electron.ts`) opens
  `userData/tepegoz.db`, runs `migrate()`, and exposes `getDb()`. `@tepegoz/persistence` is **bundled**
  into main (TS source, in WORKSPACE_PACKAGES); its native dep **better-sqlite3 stays external** and is
  rebuilt for the Electron ABI (`pnpm --filter @tepegoz/desktop run rebuild`, `@electron/rebuild`).
- **Graceful degrade:** if the native module can't load (e.g. a dev checkout that skipped the rebuild),
  `getDb()` returns null and history/journal writes no-op — the browser still runs.
- **History:** migration v2 adds a `history` table (one row per URL, visits coalesced) + a
  `HistoryStore`; TabManager records visits on `did-navigate`. Surfaced at `tepegoz://history`
  (internal-page model, ADR-0013/0012 sibling) with search + delete + clear.
- **Agent journal:** agent run events project into the EventJournal (`correlationId = runId`),
  completing the DoD "→ Event Journal".

## Consequences
- A single place holds everything the user cares about; cloud sync later is not a schema migration
  (the `kv` table already carries `updated_at`/`version`/`tombstone`, ADR-0004).
- The native module is the one runtime dependency that must match the Electron ABI; the graceful-degrade
  path keeps a missing/mismatched build from bricking the app.
- Built-in extension enable/disable state stays in `preferences.json` for now; the DB's
  `installed_extensions` table is a scaffold for real third-party (MV3) installs (Phase 3).
- Rejected: home-dir `~/.tepegoz` (user preferred %APPDATA%, matching Windows convention); everything
  in one SQLite file incl. Preferences (Chrome keeps Preferences as JSON — chosen for parity + simple
  hand-editing/debugging).
