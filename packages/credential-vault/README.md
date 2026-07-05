# @tepegoz/credential-vault

BYO-key vault for AI provider API keys. Keys are encrypted with an injected `SecretCrypto` (the desktop
app wires Electron's `safeStorage`, which uses Windows DPAPI) and persisted as base64 ciphertext to an
injected file path via `@tepegoz/json-store`. Raw keys never leave the caller — the renderer only ever
sees metadata or a per-provider boolean status. Electron-free, so the core is unit-testable without a
runtime; the Electron wiring lives in the desktop app's `stores.electron.ts`.

## Exports
- **`CredentialVault`** (default export) — static store over an id-keyed collection, so a provider can
  hold any number of labeled keys, ordered by priority (first = default):
  - `init({ crypto, filePath })` — loads the on-disk file; a legacy flat `{ provider: base64 }` map is
    upconverted in-place to the current versioned shape on first load.
  - `addKey(provider, label, apiKey)` / `removeKey(id)` (idempotent) / `renameKey(id, label)` /
    `reorderKeys(orderedIds)` — mutate the collection; every mutation persists immediately.
  - `listMeta()` / `listMetaByProvider(provider)` / `status()` / `topProvider()` — renderer-safe reads
    (metadata only, no ciphertext).
  - `getKeyById(id)` / `getFirstKeyForProvider(provider)` — **main-process only**: decrypt and return a
    raw key. Never expose these over IPC.
  - `isEncryptionAvailable()` / `reset()` (test seam).
- **`SecretCrypto`** — the injected crypto interface (`isAvailable`/`encrypt`/`decrypt`) the host
  implements over the OS keychain.
- **`ProviderKeyMeta`** / **`ProviderKeyStatus`** — re-exported from `@tepegoz/shared-types` (single
  schema source); the renderer-safe key metadata (id/provider/label/createdAt/last4) and the
  per-provider "has a key" status map.

## Notes
- Malformed or unknown-provider records are dropped individually on load, so one corrupt entry can't
  discard the whole vault.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
