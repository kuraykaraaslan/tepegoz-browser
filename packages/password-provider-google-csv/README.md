# @tepegoz/password-provider-google-csv

A `PasswordProvider` (from `@tepegoz/password-core`) implementing Google Password Manager's CSV
interop format. It is read-only on its own — it holds no credentials of its own, so `list`/`findById`/
`findByUrl` are all empty/no-op and `set()`/`export()` delegate entirely to the registered `local`
provider (`@tepegoz/password-vault`'s `PasswordVault`). This keeps the local vault as the single
encrypted storage engine; this package owns only the CSV import/export data-plane logic (parsing and
serializing the Google format), never touching encryption keys itself.

## Exports
- **`GoogleCsvProvider`** (+ **`googleCsvProvider`** singleton instance) — `id: 'google-csv'`,
  `displayName: 'Google Password Manager (CSV)'`, capabilities `{ canWrite: false, canImport: true,
  canExport: true, canSync: false }`. `import(data)` parses Google's CSV export and calls `set()` on
  the local vault for each row (aggregating `{ imported, skipped, errors }`); `export(format)`
  delegates to the local vault's own `export`, since decryption lives there.
- **`parseGoogleCsv(csv)`** — pure parser: header row (name/url/username/note) auto-detected and
  skipped if present; rows missing `url`/`username`/`password` are filtered out. Handles quoted CSV
  fields with embedded commas/quotes.
- **`serializeGoogleCsv(rows)`** — the inverse pure serializer, with the same header and quoting rules.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
