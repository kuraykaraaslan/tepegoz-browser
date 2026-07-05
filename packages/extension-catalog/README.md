# @tepegoz/extension-catalog

The data-driven **catalog model and loader** for the browser's built-in/first-party extension list.
Adding, retiring, or retuning an extension is a change to the catalog data file, not code — the same
philosophy `@tepegoz/model-catalog` follows for on-device models. Depends only on `@tepegoz/extension-sdk`
(for the extension manifest shape) and zod; no Electron.

## Exports
- **`CatalogFileSchema`** / **`CatalogFile`** / **`CATALOG_VERSION`** — the on-disk catalog file
  envelope and its schema version.
- **`loadCatalog(raw)`** — validates a parsed catalog file at the trust boundary; returns a
  `LoadCatalogResult` (valid entries + human-readable errors for anything malformed), dropping bad
  entries individually rather than discarding the whole file.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
