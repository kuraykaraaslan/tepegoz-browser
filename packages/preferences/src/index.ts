/**
 * `@tepegoz/preferences` — persisted app preferences (theme, language, telemetry, cost-saver, default
 * provider, extension states, UA override). The zod schema + defaults live here; the `Preferences`
 * TYPE is owned by `@tepegoz/desktop-ipc` (preload-safe) and pinned to the schema via `satisfies`.
 * The store's file path is injected (unit-testable). Extracted from `apps/desktop` per docs/package-map.md.
 */
export { default } from './preference-store';
export * from './preferences.model';
