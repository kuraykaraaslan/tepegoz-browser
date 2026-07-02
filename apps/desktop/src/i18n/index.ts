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
export const sidebarDict = defineDict({ en: en.sidebar, tr: tr.sidebar });
export const menuDict = defineDict({ en: en.menu, tr: tr.menu });
export const userMenuDict = defineDict({ en: en.userMenu, tr: tr.userMenu });
