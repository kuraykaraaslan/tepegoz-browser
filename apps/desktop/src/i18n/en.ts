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
    home: 'Home',
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
  // Main (hamburger) menu — the Chrome-style item set. Real actions reuse existing strings
  // (browser.newTab/reopenTab/reload/exit, common.settings, history.title, extensions.title/manage);
  // the keys below are menu-only rows, several of which are not-yet-implemented placeholders.
  menu: {
    newWindow: 'New window',
    newIncognito: 'New Incognito window',
    profileYou: 'You',
    passwords: 'Passwords and autofill',
    downloads: 'Downloads',
    bookmarks: 'Bookmarks and lists',
    tabGroups: 'Tab groups',
    deleteBrowsingData: 'Delete browsing data…',
    zoom: 'Zoom',
    print: 'Print…',
    searchLens: 'Search this tab with Google Lens',
    translate: 'Translate…',
    findEdit: 'Find and edit',
    castSaveShare: 'Cast, save, and share',
    moreTools: 'More tools',
    help: 'Help',
    showFullHistory: 'Show full history',
    // Short captions shown under the grouped icon buttons (the full labels above stay the tooltips).
    short: {
      newWindow: 'Window',
      newIncognito: 'Incognito',
      deleteBrowsingData: 'Clear',
      passwords: 'Passwords',
      downloads: 'Downloads',
      bookmarks: 'Bookmarks',
      tabGroups: 'Groups',
      print: 'Print',
      searchLens: 'Lens',
      translate: 'Translate',
      findEdit: 'Find',
      castSaveShare: 'Share',
      moreTools: 'Tools',
      help: 'Help',
    },
  },
  // User (profile) menu — placeholder for now; mirrors Chrome's profile menu. Not yet wired.
  userMenu: {
    menuLabel: 'Profile menu',
    name: 'You',
    email: 'you@example.com',
    passwords: 'Passwords and autofill',
    manageAccount: 'Manage your account',
    customizeProfile: 'Customize profile',
    sync: 'Sync is on',
    closeProfile: 'Close this profile',
    otherProfiles: 'Other profiles',
    addProfile: 'Add profile',
    guestProfile: 'Open Guest profile',
    manageProfiles: 'Manage profiles',
  },
};

/** Shape contract derived from the English source. */
export type AppStrings = typeof en;
