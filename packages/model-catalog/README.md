# @tepegoz/model-catalog

The **local/on-device model catalog**: a data-driven list of downloadable GGUF models (same
philosophy as `@tepegoz/extension-catalog` — adding/retuning a model is a data change to
`models.catalog.json`, not code), plus the pure orchestration for downloading, verifying, and
tracking install state. sha256 integrity is mandatory before a model is ever loaded. All disk/network
I/O is injected (`DownloadStreamDeps`) so the resumable-download logic is unit-testable over a fake
stream; the real axios stream + file append live in the desktop app
(`main/model-catalog/model-manager.electron.ts`).

## Exports

- **`ModelEntrySchema`** / **`ModelEntry`** — one catalog entry (id, name, url, sizeBytes, sha256,
  quant, ctx, paramsB, `recommended`/`firstParty` flags, license, optional `minRamBytes`).
- **`CatalogFileSchema`** / **`CATALOG_VERSION`** — the on-disk catalog file envelope.
- **`loadCatalog(raw)`** — validates a parsed catalog file at the trust boundary; drops malformed or
  duplicate-id entries individually instead of discarding the whole file, returning both the valid
  entries and human-readable errors.
- **`ModelInstallSchema`** / **`ModelInstall`** / **`ModelInstallStatusEnum`** — persisted per-model
  install record (`downloading`/`installed`/`error`, bytes downloaded, `sha256Verified`, file path).
- **`loadInstallState`**, **`upsertInstall`**, **`removeInstall`**, **`findInstall`** — pure,
  immutable helpers over the install-state file (lenient load: drops malformed records, keeps the rest).
- **`downloadStream(url, deps)`** — resumable download orchestration (HTTP Range resume, progress,
  cooperative cancellation) over the injected `DownloadStreamDeps`.
- **`sha256OfStream`**, **`sha256OfBuffer`**, **`digestsMatch`** — streaming/in-memory sha256 and a
  case-insensitive digest comparison, used to verify a finished download end-to-end.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
