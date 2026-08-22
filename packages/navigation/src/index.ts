/**
 * `@tepegoz/navigation` — pure navigation logic for the browser: omnibox → safe http(s) URL (scheme
 * allow-list), internal-page (`tepegoz://…`) detection, the trusted-origin allow-list, and the
 * back/forward button dropdown model. No Electron and no app imports — the desktop app injects
 * `isPackaged`, its internal-page set, and each tab's history snapshot via thin adapters. Extracted
 * from `apps/desktop` per docs/package-map.md.
 */
export { isWebUrl, internalPageUrl, toNavigationUrl } from './navigation-url';
export { isTrustedAppUrl } from './trusted-origin';
export {
  navHistoryMenuEntries,
  navHistoryMenuLabel,
  NAV_HISTORY_MENU_MAX,
  type NavHistoryDirection,
  type NavHistoryEntry,
  type NavHistoryMenuEntry,
} from './history-dropdown';
