/**
 * App-owned UI strings: chrome/namespaces that the desktop app renders itself (renderer AND main
 * process), which no reusable package owns. English is the source shape; `tr.ts` must match exactly.
 * Shared cross-cutting strings (common/window/errors) stay in `@tepegoz/i18n`; feature strings live
 * with their extension/package.
 */
export const en = {
  browser: {
    tabs: 'Tabs',
    newTab: 'New tab',
    closeTab: 'Close tab',
    untitled: 'New Tab',
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    omniboxPlaceholder: 'Search or enter address',
    // Omnibox suggestion hints (deterministic dropdown — no AI thread).
    omniboxSearchHint: 'Search the web',
    omniboxSwitchToTab: 'Switch to tab',
    settings: 'Settings',
    menu: 'Main menu',
    exit: 'Exit',
    // Tab right-click menu (native), mirroring Chrome's tab context menu.
    newTabRight: 'New tab to the right',
    duplicateTab: 'Duplicate',
    closeOtherTabs: 'Close other tabs',
    closeTabsRight: 'Close tabs to the right',
  },
  commandPalette: {
    placeholder: 'Type a command or ask Tepegöz…',
    modeChat: 'Chat',
    modeDo: 'Do',
    modeMake: 'Make',
    modeTasks: 'Tasks',
  },
  extensions: {
    title: 'Extensions',
    manage: 'Manage extensions',
    search: 'Search extensions',
    empty: 'No matching extensions',
  },
  sidebar: {
    resize: 'Resize sidebar',
  },
  history: {
    title: 'History',
    search: 'Search history',
    empty: 'No history yet',
    clear: 'Clear all',
    delete: 'Remove',
  },
  onboarding: {
    welcome: 'Welcome to Tepegöz',
    consentTitle: 'Your data, your control',
    consentBody: 'Telemetry is off by default. Sensitive sites are locked from automation.',
  },
  settings: {
    title: 'Settings',
    search: 'Search settings',
    noResults: 'No matching settings',
    providersTitle: 'Providers & API keys',
    providersSubtitle:
      'Keys are encrypted on this device (OS keychain) and never leave it without your action.',
    apiKey: 'API key',
    apiKeyPlaceholder: 'Paste your key…',
    keySet: 'Key set',
    keyNotSet: 'No key',
    remove: 'Remove',
    keySaved: 'Key saved.',
    keyRemoved: 'Key removed.',
    encryptionUnavailable:
      'OS encryption is unavailable — keys cannot be stored securely on this device.',
    providerNames: {
      anthropic: 'Claude (Anthropic)',
      openai: 'OpenAI',
      gemini: 'Gemini (Google)',
    },
    appearanceTitle: 'Appearance',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    languageTitle: 'Language',
    langSystem: 'System',
    privacyTitle: 'Privacy & telemetry',
    telemetry: 'Share anonymous usage telemetry',
    telemetryDesc: 'Off by default. No page content or keys are ever sent.',
    costTitle: 'Cost & performance',
    localModel: 'Use a local model for simple tasks',
    localModelDesc:
      'Runs simple steps (classify, summarize) on-device to cut AI cost, falling back to the cloud when needed. The local model activates in a later release.',
  },
};

/** Shape contract derived from the English source. */
export type AppStrings = typeof en;
