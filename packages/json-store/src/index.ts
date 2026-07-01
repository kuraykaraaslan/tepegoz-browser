/**
 * `@tepegoz/json-store` — tiny, crash-safe JSON file helpers for main-process stores (preferences,
 * credential vault). Node-only (no Electron); callers validate the returned shape with zod. Extracted
 * from `apps/desktop` per docs/package-map.md.
 */
export { readJsonFile, writeJsonFile } from './json-store';
