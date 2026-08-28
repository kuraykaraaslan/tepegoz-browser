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
    // Tab title for the unlisted `tepegoz://developer` page (Chromium flags + raw preferences editor).
    developerPageTitle: 'Developer',
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
    // ── Omnibox command mode (`@agent` / `@download` / `@skill`) ───────────────────────────────────
    // `@agent` is the ONE place the address bar crosses into AI, and only ever from a prefix the user
    // typed on purpose. `omniboxAgentHint` therefore says out loud what pressing Enter will do —
    // Comet's mistake was ordinary text becoming a model prompt with nothing telling the user.
    omniboxCommand: 'Command',
    omniboxAgentAsk: 'Ask the agent: {task}',
    omniboxAgentHint: 'Hands this text to the agent — leaves the deterministic address bar',
    omniboxAgentEmpty: 'Type what the agent should do',
    omniboxCommandAgent: 'Give the agent a task',
    omniboxCommandDownload: 'Find something you downloaded',
    omniboxCommandSkill: 'Run a saved skill',
    omniboxDownload: 'Download',
    omniboxSkill: 'Skill',
    omniboxCommandNoResults: 'Nothing matched',
    // Omnibox zoom indicator (Chrome-style; appears only when the page is off 100%).
    zoom: 'Zoom',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomReset: 'Reset',
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
    // Discard/sleep — free a background tab's memory; it reloads the next time it is activated.
    discardTab: 'Discard tab',
    // Back/forward button dropdown (right-click a nav button) — the last row, under the entries.
    showFullHistory: 'Show full history',
    // System tray (close-to-tray) — the app keeps running so background tabs + the agent stay live.
    trayShow: 'Show Tepegöz',
    trayQuit: 'Quit',
    trayTooltip: 'Tepegöz',
    trayRunning: 'Tepegöz is still running in the system tray.',
    // Agent-active indicator (S8 PR5). A run that continues out of sight has to be visible SOMEWHERE,
    // or "still working" is indistinguishable from "quietly stopped".
    trayAgentRunning: 'Tepegöz — the agent is working',
    // Network privacy (Phase 5) — the per-tab / per-group route picker in the native context menus.
    routeTabThrough: 'Route this tab through…',
    routeGroupThrough: 'Route this group through…',
    routeDirect: 'Direct (no tunnel)',
    routeInherit: 'Inherit',
    routeInheritGroup: 'Inherit from group',
    routeInheritGeneral: 'Inherit from default',
    routeNoConnections: 'No connections configured',
    routeManage: 'Manage connections…',
    routeStatusUp: 'connected',
    routeStatusDown: 'not connected',
    routeStatusConnecting: 'connecting…',
    routeReloadNotice: 'Changing the route reloads the affected tabs.',
    // The NATIVE file picker for importing a WireGuard profile. Its own title is chrome we own and is
    // translated; the file-type name stays "WireGuard" because that is the product's name, not a word.
    wireguardPickerTitle: 'WireGuard profile',
    // The macOS-only application menu (`menus/application-menu.ts`). Windows and Linux have no menu
    // bar at all here — the windows are frameless — so this is the only label it needs.
    menuEdit: 'Edit',
    // "Save as PDF" (page right-click → Save as PDF). `pdfDefaultName` is the file-name stem used when
    // the page has no usable title of its own.
    savePdf: 'Save as PDF…',
    pdfDefaultName: 'page',
    pdfSavedTitle: 'Saved as PDF',
    pdfFailedTitle: 'Could not save the PDF',
    pdfFailedBody: 'The page could not be written to that file. Try another folder or file name.',
    // The page's own `beforeunload` prompt (`main/navigation/unload-broker.ts`). The page's own message
    // is deliberately NOT shown — Chromium stopped rendering custom text there in 2016 because pages
    // used it for scareware — so these words are the whole dialog.
    // ── Private (disposable) window ────────────────────────────────────────────────────────────────
    // The disclosure is required by phase-2c in as many words: the surface must say what it does NOT do.
    // A separate partition discards local state; it does not separate identity. The limit is stated
    // before the reassurance on purpose — every mainstream browser has been criticised for the reverse.
    privateBadge: 'Private',
    privateTitle: 'Private window',
    privateNotHidden:
      'This does not make you anonymous. Your device, screen, fonts and network address are unchanged, so a site that fingerprints can still recognise you, and your network or employer can still see where you go.',
    privateDiscardsTitle: 'Discarded when the last private window closes',
    privateDiscardsState:
      'Cookies, logins, caches and site storage — kept in memory, never written to disk',
    privateDiscardsHistory: 'Browsing history — private pages are never recorded',
    privateDiscardsSession: 'These tabs are not saved, so they do not reopen on the next launch',
    privateKeepsTitle: 'Not hidden by this',
    privateKeepsFingerprint:
      'Your device fingerprint — a site can link this window to your ordinary one',
    privateKeepsNetwork: 'Your traffic, from your network, your ISP, or a VPN operator',
    privateKeepsDownloads:
      'Files you download and bookmarks you add — those are yours and are kept',
    privateLockout:
      'Sensitive-site protection still applies here, exactly as it does in an ordinary window.',
    // ── User screenshots ──────────────────────────────────────────────────────────────────────────
    // The size and the format are BOTH stated. The whole reason the WebP path exists is that these
    // files live on the user's disk, and a number they can see is what makes that claim checkable —
    // and `{format}` reading `png` means the WebP encode did not happen, which the copy must not hide.
    screenshotSavedTitle: 'Screenshot saved',
    screenshotSavedBody: '{size} KB, {format}',
    screenshotFailedTitle: 'Could not take the screenshot',
    screenshotFailedBody: 'Nothing was captured. Try again once the page has finished loading.',
    unloadTitle: 'Leave this site?',
    unloadDetail: 'Changes you have made may not be saved.',
    unloadLeave: 'Leave',
    unloadStay: 'Stay',
    routeTunneled: 'Routed through {name}',
    routeTunneledInherited: 'Inherited route: {name}',
    routeBlocked: 'Blocked — {name} is not connected',
    routeLegVpn: 'VPN',
    routeLegTor: 'Tor',
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
    taskManager: 'Task manager',
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
