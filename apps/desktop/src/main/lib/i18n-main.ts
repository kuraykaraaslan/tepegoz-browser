import { app } from 'electron';
import { pick, resolveLocale, type Locale } from '@tepegoz/i18n';
import { browserDict, extensionsDict, historyDict, settingsDict } from '../../i18n';
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
  extensions: typeof extensionsDict.en;
  history: typeof historyDict.en;
  settings: typeof settingsDict.en;
} {
  const l = mainLocale();
  return {
    browser: pick(browserDict, l),
    extensions: pick(extensionsDict, l),
    history: pick(historyDict, l),
    settings: pick(settingsDict, l),
  };
}
