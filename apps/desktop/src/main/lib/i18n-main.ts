import { app } from 'electron';
import { resolveLocale, resources, type Locale } from '@tepegoz/i18n';
import PreferenceStore from '@tepegoz/preferences';

/**
 * Resources for the active locale (pref override → OS locale → default), for MAIN-PROCESS user-facing
 * strings — native menus and internal-tab titles. Resolved per call so it follows a live locale
 * change without a restart. Single source shared by the menus and TabManager (no per-file copies).
 */
export function mainLocale(): Locale {
  const pref = PreferenceStore.getAll().locale;
  return pref === 'en' || pref === 'tr' ? pref : resolveLocale(app.getLocale());
}

export function mainResources(): (typeof resources)[Locale] {
  return resources[mainLocale()];
}
