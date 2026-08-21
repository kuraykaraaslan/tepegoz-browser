# @tepegoz/password-core

Provider-agnostic types and registry for the password manager. Defines the `PasswordProvider`
interface every credential source (the local encrypted vault in `@tepegoz/password-vault`, the
`@tepegoz/password-provider-google-csv` importer, and any future provider like Bitwarden) implements,
plus a central registry that aggregates across all of them. Its only dependency is
`@tepegoz/credential-vault`, from which it re-exports the `SecretCrypto` interface so providers share
one crypto contract without a circular import.

## Exports

- **`PasswordProviderRegistry`** — static registry: `register(provider)`, `get(id)`, `list()`,
  `findByUrl(url)` (normalizes the URL to its origin and aggregates `findByUrl` results across every
  registered provider — so autofill/UI never need to know which provider owns a credential),
  `list_all()` (aggregate metadata across all providers), `reset()` (test seam).
- **`PasswordProvider`** — the interface a provider implements: `id`/`displayName`/`capabilities`,
  `list()`/`findById()`/`findByUrl()` (metadata- or full-credential-returning reads), `set()`/`remove()`
  (mutations), and optional `import()`/`export()`.
- **`ProviderCapabilities`** — `canWrite`/`canImport`/`canExport`/`canSync` flags a provider declares.
- **`LoginCredentialMeta`** — IPC-safe credential metadata (no password).
- **`LoginCredential`** — full record including `encryptedPassword`; **main-process only**, never
  crosses IPC.
- **`NewCredential`** — input shape for creating/updating a credential (plaintext password; the
  provider encrypts on write and never stores or returns the plaintext).
- **`ImportFormat`** / **`ExportFormat`** / **`ImportResult`** — the import/export contract shared by
  every provider that supports it.
- **`AutofillAvailablePayload`** — `{ url, matches }` shape used to notify the renderer that autofill
  candidates exist for the current page.
- **`SecretCrypto`** — re-exported from `@tepegoz/credential-vault`.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
