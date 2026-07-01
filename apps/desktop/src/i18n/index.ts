import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { AppStrings } from './en';

/**
 * Per-namespace app dictionaries. Renderer consumes them with `useT(...)`; the main process picks them
 * for the active locale via `pick(...)` in `lib/i18n-main.ts`. Split per namespace so each `useT` call
 * (and each main-process import) pulls only what it needs.
 */
export const browserDict = defineDict({ en: en.browser, tr: tr.browser });
export const commandPaletteDict = defineDict({ en: en.commandPalette, tr: tr.commandPalette });
export const extensionsDict = defineDict({ en: en.extensions, tr: tr.extensions });
export const sidebarDict = defineDict({ en: en.sidebar, tr: tr.sidebar });
export const historyDict = defineDict({ en: en.history, tr: tr.history });
export const onboardingDict = defineDict({ en: en.onboarding, tr: tr.onboarding });
export const settingsDict = defineDict({ en: en.settings, tr: tr.settings });
