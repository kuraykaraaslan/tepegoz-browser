# @tepegoz/password-vault

The local encrypted password manager vault: a `PasswordProvider` (from `@tepegoz/password-core`)
backed by SQLite, plus its CRUD layer. Passwords are encrypted via an injected `SecretCrypto`
(Electron `safeStorage`/DPAPI in the desktop app) before ever reaching disk; raw passwords never leave
this package — `findById`/`findByUrl` on `PasswordVault` are main-process-only reads, never exposed
over IPC. Operates on a `Db` injected by the desktop app (the `login_credentials` table schema itself
lives in `@tepegoz/persistence` migrations), so this package is a thin CRUD/business-logic layer, not
the schema owner.

## Exports

- **`PasswordVault`** (+ **`passwordVault`** singleton instance) — implements `PasswordProvider` as
  `id: 'local'`, `displayName: 'Local Vault'`, with full write/import/export capabilities:
  - `init({ crypto, db })` — must be called once at app startup; `reset()` is a test seam.
  - `list()` / `findById(id)` / `findByUrl(url)` — reads (the latter two return the full,
    still-encrypted record; decrypt only via `decrypt()`, main-process only).
  - `set(credential)` — upserts by normalized origin + username; encrypts the password immediately.
  - `remove(id)`.
  - `decrypt(credential)` — **main-process only**, never call from an IPC handler.
  - `import(csvData)` — best-effort generic CSV import (name/url/username/password/note columns,
    header row auto-detected); returns `{ imported, skipped, errors }`.
  - `export()` — serializes every stored credential (decrypted) to the same generic CSV shape.
- **`PasswordStore`** — the static SQLite CRUD layer (`list`/`findById`/`findByUrl`/`upsert`/`remove`
  over the `login_credentials` table) that `PasswordVault` delegates to; mirrors the conventions of the
  persistence package's `HistoryStore`.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
