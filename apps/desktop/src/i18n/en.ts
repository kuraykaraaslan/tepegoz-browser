/**
 * App-owned UI strings: chrome/namespaces the desktop app renders itself (renderer AND main process),
 * which no reusable package owns. `browser` is genuinely shared (native menus + the chrome frame) and
 * `sidebar` is app chrome. English is the source shape; `tr.ts` must match it exactly. Shared
 * cross-cutting strings (common/window/errors) stay in `@tepegoz/i18n`; feature strings live with their
 * owning package/extension (history → `@tepegoz/history-ui`, extensions → `@tepegoz/extensions-ui`,
 * settings → `@tepegoz/settings-ui`, commandPalette → `@tepegoz/ext-agent`) per ADR-0017.
 */
export const en = {
  browser: {
    tabs: 'Tabs',
    newTab: 'New tab',
    reopenTab: 'Reopen closed tab',
    closeTab: 'Close tab',
    untitled: 'New Tab',
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    omniboxPlaceholder: 'Search or enter address',
    // Omnibox suggestion hints (deterministic dropdown — no AI thread).
    omniboxSearchHint: 'Search the web',
    omniboxSwitchToTab: 'Switch to tab',
    omniboxBookmark: 'Bookmark',
    // Bookmark star (right of the omnibox).
    bookmarkAdd: 'Bookmark this page',
    bookmarkRemove: 'Remove bookmark',
    menu: 'Main menu',
    exit: 'Exit',
    // Tab right-click menu (native), mirroring Chrome's tab context menu.
    newTabRight: 'New tab to the right',
    duplicateTab: 'Duplicate',
    closeOtherTabs: 'Close other tabs',
    closeTabsRight: 'Close tabs to the right',
  },
  sidebar: {
    resize: 'Resize sidebar',
  },
};

/** Shape contract derived from the English source. */
export type AppStrings = typeof en;
