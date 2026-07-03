/**
 * English is the source shape for this package's own strings; `tr.ts` must match it exactly. The page
 * title is intentionally absent — it reuses the shared-core `common.settings` (no re-translation).
 */
export const en = {
  search: 'Search settings',
  noResults: 'No matching settings',

  // --- Sidebar group headings (Chrome/Edge-style) ---
  groupGeneral: 'General',
  groupAiAgent: 'AI & Agent',
  groupPrivacy: 'Privacy & security',
  groupAdvanced: 'Advanced',
  groupAbout: 'About',
  comingSoon: 'Coming soon',

  // --- Appearance ---
  appearanceTitle: 'Appearance',
  theme: 'Theme',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  themePreviewHint: 'Pick a theme — the preview shows how it looks.',
  colorTheme: 'Color theme',
  colorThemeHint: 'Pick one color — text contrast is chosen automatically.',
  customColor: 'Custom',

  // --- Language & region ---
  languageRegionTitle: 'Language & region',
  languageLabel: 'Language',
  langSystem: 'System',
  regionLabel: 'Region',
  regionSystem: 'System default',
  dateFormatLabel: 'Date format',
  dateShort: 'Short',
  dateMedium: 'Medium',
  dateLong: 'Long',
  dateFull: 'Full',
  previewLabel: 'Preview',

  // --- Preferences (startup + search engine) ---
  preferencesTitle: 'Preferences',
  searchEngineLabel: 'Search engine',
  searchEngineDesc: 'The engine used when you search from the address bar.',
  searchEngineCustom: 'Add a custom engine',

  // --- Notifications ---
  notificationsTitle: 'Notifications',
  notifications: 'Enable notifications',
  notificationsDesc:
    'Show the notification center, toasts, and native OS notifications for agent handoffs, sites, and system events. When off, only the center keeps a history.',

  // --- Providers & API keys ---
  providersTitle: 'Providers & API keys',
  providersSubtitle:
    'Keys are encrypted on this device (OS keychain) and never leave it without your action.',
  providerSelectLabel: 'Provider',
  apiKey: 'API key',
  apiKeyPlaceholder: 'Paste your key…',
  keyLabel: 'Label',
  keyLabelPlaceholder: 'e.g. Work, Personal',
  addKey: 'Add key',
  rename: 'Rename',
  cancel: 'Cancel',
  remove: 'Remove',
  noKeysYet: 'No keys added yet.',
  defaultBadge: 'Default',
  reorderHint: 'Drag to reorder — the topmost key is the default.',
  providerNotUsableYet: 'Stored — running with this provider arrives in a later release.',
  encryptionUnavailable:
    'OS encryption is unavailable — keys cannot be stored securely on this device.',
  keyAdded: 'Key added.',
  keyRemoved: 'Key removed.',
  keyRenamed: 'Key renamed.',
  keysReordered: 'Order updated.',
  providerNames: {
    anthropic: 'Claude (Anthropic)',
    openai: 'OpenAI',
    gemini: 'Gemini (Google)',
  },

  // --- Cost & performance ---
  costTitle: 'Cost & performance',
  localModel: 'Use a local model for simple tasks',
  localModelDesc:
    'Runs simple steps (classify, summarize) on-device to cut AI cost, falling back to the cloud when needed. The local model activates in a later release.',

  // --- Connections / MCP ---
  connectionsTitle: 'Connections',
  connectionsSubtitle:
    'Model Context Protocol (MCP) servers. Their tools become available to the agent through the security policy. Add servers in preferences; editing here arrives in a later release.',
  mcpNoServers: 'No MCP servers configured.',
  mcpStateIdle: 'Idle',
  mcpStateConnecting: 'Connecting…',
  mcpStateReady: 'Ready',
  mcpStateError: 'Error',
  mcpToolCount: 'tools',

  // --- Privacy & telemetry ---
  privacyTitle: 'Privacy & telemetry',
  telemetry: 'Share anonymous usage telemetry',
  telemetryDesc: 'Off by default. No page content or keys are ever sent.',
  clearHistoryLabel: 'Browsing history',
  clearHistoryDesc: 'Remove the list of pages you have visited on this device.',
  clearHistoryButton: 'Clear history',
  historyCleared: 'Browsing history cleared.',

  // --- Site permissions ---
  sitePermissionsTitle: 'Site permissions',
  sitePermissionsSubtitle: 'Per-site capability grants (e.g. notifications).',
  sitePermissionsEmpty: 'No per-site permissions set.',
  sitePermissionNotifications: 'Notifications',
  permissionReset: 'Reset',

  // --- Passwords ---
  passwordsTitle: 'Passwords',

  // --- Reset ---
  resetTitle: 'Reset settings',
  resetDesc:
    'Restore all preferences to their defaults. Saved API keys and passwords are not affected.',
  resetButton: 'Reset to defaults',
  resetConfirm: 'Reset all settings to defaults? Saved keys and passwords are kept.',
  resetDone: 'Settings reset to defaults.',

  // --- About ---
  aboutTitle: 'About',
  aboutName: 'Name',
  aboutVersion: 'Version',
  aboutPlatform: 'Platform',
  aboutProjectTitle: 'About Tepegöz',
  aboutProjectDesc:
    'Tepegöz is an agentic, security-by-design, local-first web browser built with Electron and TypeScript.',
  aboutAuthorTitle: 'Author',
  authorName: 'Kuray Karaaslan',
  aboutWebsite: 'Website',
  aboutGithub: 'GitHub',
  aboutLinkedin: 'LinkedIn',
  aboutInstagram: 'Instagram',

  // --- Placeholder ("coming soon") sections — pure UI, persist nothing (see ComingSoonCard) ---
  coming: {
    onStartup: {
      title: 'On startup',
      description: 'What opens when the browser launches.',
      items: ['Open a new tab', 'Continue where you left off', 'Open specific pages', 'Homepage'],
    },
    downloads: {
      title: 'Downloads',
      description: 'Where files are saved.',
      items: ['Download location', 'Ask where to save each file', 'Clear download history'],
    },
    accessibility: {
      title: 'Accessibility',
      description: 'Options to make the browser easier to use are coming soon.',
    },
    agentControls: {
      title: 'Agent controls',
      description: 'Fine-grained control over the AI agent.',
      items: ['Autonomy / approval level', 'Token-budget cap', 'Model routing', 'Per-tool permissions'],
    },
    autofill: {
      title: 'Autofill',
      description: 'Saved payment methods and addresses.',
      items: ['Payment methods', 'Addresses', 'Password breach check'],
    },
    system: {
      title: 'System',
      description: 'System-level behavior.',
      items: ['Launch at startup', 'Hardware acceleration', 'Proxy settings'],
    },
  },
};

export type SettingsStrings = typeof en;
