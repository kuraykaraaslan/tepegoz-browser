/**
 * English is the PRIMARY / SOURCE locale. Its shape is the contract: every other locale must match
 * it exactly (enforced by the `Resources` type and the catalog-integrity test). No user-facing string
 * is hardcoded in components — it always comes from here.
 */
export const en = {
  common: {
    appName: 'Tepegöz',
    ok: 'OK',
    cancel: 'Cancel',
    retry: 'Retry',
    save: 'Save',
    settings: 'Settings',
    showPassword: 'Show',
    hidePassword: 'Hide',
  },
  window: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
  },
  browser: {
    tabs: 'Tabs',
    newTab: 'New tab',
    closeTab: 'Close tab',
    untitled: 'New Tab',
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    omniboxPlaceholder: 'Search or enter address',
    settings: 'Settings',
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
  agentConsole: {
    title: 'Agent Console',
    progress: 'Progress',
    tokens: 'Tokens',
    noActiveTasks: 'No active tasks',
    awaitingApproval: 'Awaiting your approval',
  },
  onboarding: {
    welcome: 'Welcome to Tepegöz',
    consentTitle: 'Your data, your control',
    consentBody: 'Telemetry is off by default. Sensitive sites are locked from automation.',
  },
  errors: {
    unauthorized: 'Authentication required',
    forbidden: 'Action blocked by policy',
    badState: 'Invalid state for this operation',
    upstreamDown: 'Service unavailable',
  },
  settings: {
    title: 'Settings',
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

/** Shape contract derived from the English source (values widened to string). */
export type Resources = typeof en;
