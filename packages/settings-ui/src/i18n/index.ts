import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { SettingsStrings } from './en';

/**
 * This package's own dictionary. The shell + the app's settings page consume it with
 * `useT(settingsDict)` (self-localizing). Framework-agnostic (no React import). The page title is not
 * here — it reuses the shared-core `common.settings`.
 */
export const settingsDict = defineDict({ en, tr });
