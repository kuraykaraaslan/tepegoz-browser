import { app } from 'electron';
import { coreDict, pick, resolveLocale, type Locale } from '@tepegoz/i18n';
import { extensionsDict } from '@tepegoz/extensions-ui/i18n';
import { historyDict } from '@tepegoz/history-ui/i18n';
import { browserDict } from '../../i18n';
import PreferenceStore from '@tepegoz/preferences';

/**
 * MAIN-PROCESS user-facing strings — native menus and internal-tab titles. Non-React, so it picks each
 * app dictionary for the active locale via `pick` (not the renderer's `useT`). Resolved per call so it
 * follows a live locale change without a restart. Single source shared by the menus and TabManager (no
 * per-file copies). Only the app-owned namespaces the main process actually renders are exposed.
 */
export function mainLocale(): Locale {
  const pref = PreferenceStore.getAll().locale;
  return pref === 'en' || pref === 'tr' ? pref : resolveLocale(app.getLocale());
}

export function mainStrings(): {
  browser: typeof browserDict.en;
  common: typeof coreDict.en.common;
  extensions: typeof extensionsDict.en;
  history: typeof historyDict.en;
} {
  const l = mainLocale();
  return {
    browser: pick(browserDict, l),
    // The settings tab title / menu entry reuse the shared-core `common.settings` (no re-translation).
    common: pick(coreDict, l).common,
    extensions: pick(extensionsDict, l),
    history: pick(historyDict, l),
  };
}
