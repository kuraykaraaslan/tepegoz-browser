/**
 * App preferences validation (main-side) — barrel. The schema is split by responsibility:
 * primitives (`preferences.primitives`), the full + patch schema (`preferences.schema`), the curated
 * public projection (`preferences.public`) and the defaults (`preferences.defaults`).
 */
export * from './preferences.primitives';
export * from './preferences.schema';
export * from './preferences.public';
export * from './preferences.defaults';
export type { Preferences } from '@tepegoz/desktop-ipc';
