# @tepegoz/json-store

Tiny, crash-safe JSON file helpers for main-process stores (Node-only, no Electron). Used by
`@tepegoz/credential-vault` and `@tepegoz/preferences` to persist their state as plain JSON files in
`userData`. Callers must validate the returned shape with zod — the file is on disk and treated as
untrusted (could be corrupted, tampered with, or from an older schema version).

## Exports

- **`readJsonFile(filePath)`** — reads and `JSON.parse`s the file; returns `undefined` if the file
  doesn't exist or fails to parse (never throws). The result is `unknown` — validate it before use.
- **`writeJsonFile(filePath, data)`** — crash-safe write: serializes `data`, writes to a sibling
  `.tmp` file, `fsync`s it, then atomically renames it over the target. Creates the parent directory
  if needed. This prevents a crash or power loss mid-write from leaving a truncated/invalid file —
  critical for stores like the encrypted credential vault, where a corrupt file would otherwise be
  silently overwritten with an empty map on the next mutation.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
