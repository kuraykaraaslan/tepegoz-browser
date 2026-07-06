import { app } from 'electron';
import { coreDict, pick, resolveLocale, type Locale } from '@tepegoz/i18n';
import { agentDict } from '@tepegoz/ext-agent/i18n';
import { agentHistoryDict } from '@tepegoz/agent-history-ui/i18n';
import { bookmarksUiDict } from '@tepegoz/bookmarks-ui/i18n';
import { extensionsDict } from '@tepegoz/extensions-ui/i18n';
import { historyDict } from '@tepegoz/history-ui/i18n';
import { downloadsDict } from '@tepegoz/downloads-ui/i18n';
import { uploadsDict } from '@tepegoz/uploads-ui/i18n';
import { tasksDict } from '@tepegoz/tasks-ui/i18n';
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
  agent: typeof agentDict.en;
  agentHistory: typeof agentHistoryDict.en;
  bookmarks: typeof bookmarksUiDict.en;
  browser: typeof browserDict.en;
  common: typeof coreDict.en.common;
  downloads: typeof downloadsDict.en;
  errors: typeof coreDict.en.errors;
  extensions: typeof extensionsDict.en;
  history: typeof historyDict.en;
  tasks: typeof tasksDict.en;
  uploads: typeof uploadsDict.en;
} {
  const l = mainLocale();
  return {
    // Agent-run surfaces the main process phrases (e.g. the Human Handoff Controller message).
    agent: pick(agentDict, l),
    agentHistory: pick(agentHistoryDict, l),
    bookmarks: pick(bookmarksUiDict, l),
    browser: pick(browserDict, l),
    // The settings tab title / menu entry reuse the shared-core `common.settings` (no re-translation).
    common: pick(coreDict, l).common,
    downloads: pick(downloadsDict, l),
    // Boundary error messages (e.g. the untrusted-sender rejection) come from the shared core too.
    errors: pick(coreDict, l).errors,
    extensions: pick(extensionsDict, l),
    history: pick(historyDict, l),
    tasks: pick(tasksDict, l),
    uploads: pick(uploadsDict, l),
  };
}
