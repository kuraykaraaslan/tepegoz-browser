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
    omniboxQuickSettings: 'Settings',
    omniboxQuickAppearance: 'Open Appearance settings',
    omniboxQuickLanguage: 'Open Language & region settings',
    omniboxQuickPrivacy: 'Open Privacy settings',
    // Bookmark star (right of the omnibox).
    bookmarkAdd: 'Bookmark this page',
    bookmarkRemove: 'Remove bookmark',
    // Bookmarks bar (the strip under the nav toolbar).
    bookmarksBar: 'Bookmarks bar',
    noBookmarksBar: 'No bookmarks yet. Star a page to add it here.',
    // Native right-click menu for a bar/manager bookmark or folder.
    bookmarkMenu: {
      open: 'Open',
      openNewTab: 'Open in new tab',
      openAll: 'Open all',
      rename: 'Rename…',
      addFolder: 'Add folder…',
      delete: 'Delete',
      manager: 'Bookmark manager',
      moveToBar: 'Move to Bookmarks bar',
    },
    // Add/rename dialog (bookmark bar).
    newFolder: 'New folder',
    folderNamePlaceholder: 'Folder name',
    renameTitle: 'Rename',
    add: 'Add',
    save: 'Save',
    cancel: 'Cancel',
    openAllConfirm: 'Open all bookmarks in new tabs?',
    menu: 'Main menu',
    exit: 'Exit',
    // Tab right-click menu (native), mirroring Chrome's tab context menu.
    newTabRight: 'New tab to the right',
    duplicateTab: 'Duplicate',
    closeOtherTabs: 'Close other tabs',
    closeTabsRight: 'Close tabs to the right',
    // Pinning + tab groups (ADR-0020).
    pinTab: 'Pin tab',
    unpinTab: 'Unpin tab',
    // Hidden tabs — removed from the strip but kept alive & rendering (the agent can keep driving them).
    hideTab: 'Hide tab',
    unhideTab: 'Unhide',
    unhideAll: 'Unhide all',
    hiddenTabs: 'Hidden tabs',
    // System tray (close-to-tray) — the app keeps running so background tabs + the agent stay live.
    trayShow: 'Show Tepegöz',
    trayQuit: 'Quit',
    trayTooltip: 'Tepegöz',
    trayRunning: 'Tepegöz is still running in the system tray.',
    // Agent-active indicator (S8 PR5). A run that continues out of sight has to be visible SOMEWHERE,
    // or "still working" is indistinguishable from "quietly stopped".
    trayAgentRunning: 'Tepegöz — the agent is working',
    addToNewGroup: 'Add tab to new group',
    addToGroup: 'Add tab to group',
    removeFromGroup: 'Remove from group',
    ungroup: 'Ungroup',
    /** Fallback label for an unnamed group (in menus and on the strip). */
    unnamedGroup: 'Group',
    /** aria-label for a group header pill. */
    groupHeader: 'Tab group',
    /** aria-label for the group collapse/expand toggle. */
    toggleGroup: 'Collapse or expand group',
    // Group header right-click menu (native).
    renameGroup: 'Rename group',
    newTabInGroup: 'New tab in group',
    closeGroup: 'Close group',
    groupColor: 'Color',
    groupColors: {
      grey: 'Grey',
      blue: 'Blue',
      red: 'Red',
      yellow: 'Yellow',
      green: 'Green',
      pink: 'Pink',
      purple: 'Purple',
      cyan: 'Cyan',
      orange: 'Orange',
    },
  },
  sidebar: {
    resize: 'Resize sidebar',
  },
  transfer: {
    title: 'Transfers',
    empty: 'No downloads or uploads yet',
    close: 'Close transfers',
    fullDownloads: 'Full download history',
    fullUploads: 'Full upload activity',
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
    uploads: 'Uploads',
    tasks: 'Tasks',
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
    // Bookmarks submenu (flyout): the show/hide bookmarks-bar toggle + empty-state row.
    showBookmarksBar: 'Show bookmarks bar',
    noBookmarks: 'No bookmarks yet',
    bookmarkManager: 'Bookmark manager',
    // Short captions shown under the grouped icon buttons (the full labels above stay the tooltips).
    short: {
      newWindow: 'Window',
      newIncognito: 'Incognito',
      deleteBrowsingData: 'Clear',
      passwords: 'Passwords',
      downloads: 'Downloads',
      uploads: 'Uploads',
      tasks: 'Tasks',
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
