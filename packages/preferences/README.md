# @tepegoz/preferences

Persisted app preferences: theme, locale, telemetry, the cost-saver "run locally" toggle, default AI
provider, extension states, MCP servers, agent panel selections, file-access grants, and more. The
`Preferences` **type** is owned by `@tepegoz/desktop-ipc` (zod-free, preload-safe); this package builds
the zod schema and defaults, and pins them to that type via `satisfies` so the two can never silently
drift. The store's file path is injected, so it stays unit-testable without Electron.

## Exports
- **`PreferenceStore`** (default export) — static store: `init({ filePath })` loads and validates the
  file (falling back to defaults on a missing/corrupt file — treated as untrusted, `readJsonFile` +
  `safeParse`), `getAll()` returns a defensive copy, `update(patch)` validates the patch, merges it,
  re-validates the whole object, persists via `@tepegoz/json-store`, and returns the new snapshot.
  `reset()` is a test seam.
- **`PreferencesSchema`** / **`PreferencesPatchSchema`** (+ `PreferencesPatch` type) — the full and
  partial (patch) zod schemas, built from the canonical enums owned by `@tepegoz/desktop-ipc`
  (`THEME_PREFS`, `LOCALE_PREFS`, `PROVIDER_IDS`, …) so there is one spelling per union, not a
  re-spelled copy per package.
- **`DEFAULT_PREFERENCES`** — the default `Preferences` value.
- **`PublicSettingsSchema`** — the runtime validator for the curated read-only settings surface exposed
  to extensions (the `PublicSettings` shape itself lives in `@tepegoz/shared-types`).
- **`ThemePrefSchema`**, **`LocalePrefSchema`**, **`ProviderPrefSchema`**, **`ExtensionIdSchema`**,
  **`ExtensionStateSchema`**, **`McpServerPrefSchema`**, and related per-field schemas — reusable
  building blocks of `PreferencesSchema`.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
