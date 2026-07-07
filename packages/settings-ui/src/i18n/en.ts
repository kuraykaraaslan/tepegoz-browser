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
  themeColorNames: {
    slate: 'Slate',
    steel: 'Steel',
    graphite: 'Graphite',
    turquoise: 'Turquoise',
    violet: 'Violet',
    maroon: 'Maroon',
    amber: 'Amber',
    forest: 'Forest',
  },
  glassTitle: 'Glass effect',
  glassHint: 'Make the tab bar and toolbar translucent, showing your desktop through them (Windows 11).',

  // --- Language & region ---
  languageRegionTitle: 'Language & region',
  languageLabel: 'Language',
  langSystem: 'System',
  regionLabel: 'Region',
  regionSystem: 'System default',
  languageSearchPlaceholder: 'Search language…',
  regionSearchPlaceholder: 'Search country…',
  searchNoResults: 'No results',
  dateFormatLabel: 'Date format',
  dateShort: 'Short',
  dateMedium: 'Medium',
  dateLong: 'Long',
  dateFull: 'Full',
  dateIso: 'ISO 8601',
  dateDmySlash: 'Day/Month/Year',
  dateMdySlash: 'Month/Day/Year',
  dateDmyDot: 'Day.Month.Year',
  dateShortMonth: 'Short month',
  previewLabel: 'Preview',

  // --- Preferences (startup + search engine) ---
  preferencesTitle: 'Preferences',
  searchEngineLabel: 'Search engine',
  searchEngineDesc: 'The engine used when you search from the address bar.',
  searchEngineCustom: 'Add a custom engine',
  searchEngineCustomName: 'Name',
  searchEngineCustomUrl: 'Search URL',
  searchEngineCustomUrlPlaceholder: 'https://example.com/search?q={q}',
  searchEngineCustomUrlHint: 'Use {q} where the query goes.',
  searchEngineCustomAdd: 'Add',
  searchEngineCustomInvalid: 'The search URL must contain {q}.',
  searchEngineRemove: 'Remove',
  homepageLabel: 'Homepage',
  homepageDesc: 'Opened for new tabs, the Home button, and a blank address-bar submit.',
  homepagePlaceholder: 'https://example.com',

  // --- Downloads ---
  downloadsTitle: 'Downloads',
  downloadsSubtitle: 'Where browser downloads are released after quarantine.',
  downloadLocationLabel: 'Download location',
  downloadLocationDesc: 'Leave empty to use the operating system Downloads folder.',
  downloadLocationPlaceholder: 'System Downloads folder',
  downloadAskEachTime: 'Ask where to save each file',
  downloadAskEachTimeDesc: 'When releasing a quarantined file, choose the final save path.',
  clearDownloadsLabel: 'Download history',
  clearDownloadsDesc: 'Remove completed, blocked, canceled, and failed downloads from the list.',
  clearDownloadsButton: 'Clear download history',

  // --- Notifications ---
  notificationsTitle: 'Notifications',
  notifications: 'Enable notifications',
  notificationsDesc:
    'Show the notification center, toasts, and native OS notifications for agent handoffs, sites, and system events. When off, only the center keeps a history.',

  // --- File operations ---
  fileOps: {
    title: 'File operations',
    subtitle:
      'Folders the AI assistant may read and modify. Everything else on your disk stays off-limits. The default folder is home/tepegoz.',
    enable: 'Allow file operations',
    enableDesc:
      'Master switch. When off, the assistant cannot touch any file, whatever the folders below say.',
    addFolder: 'Add folder',
    noFolders: 'No folders yet — add one to let the assistant work with files.',
    recursive: 'Include subfolders',
    modeLabel: 'Access',
    modes: {
      read: 'Read only',
      'read-write': 'Read & write',
      full: 'Full (incl. delete)',
    },
    modeHint:
      'Within a folder’s access level the assistant works without asking; anything beyond it — and any new folder — needs your approval.',
    remove: 'Remove',
    duplicate: 'That folder is already in the list.',
  },

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
    local: 'Local (on-device)',
  },

  // --- Cost & performance ---
  costTitle: 'Cost & performance',
  localModel: 'Use a local model for simple tasks',
  localModelDesc:
    'Runs simple AI steps (read & understand pages, summarize, classify) on your device to cut cost, falling back to the cloud when needed. Add a local model under Providers → Local.',
  localActionsHint:
    'Choose which of the agent’s AI steps may run on your device. Mechanical browser actions (click, navigate, open tab) always run natively — they have no AI step.',
  runLocallyLabel: 'On device',
  nativeNoAiLabel: 'Native · no AI',
  toolSchemaLabel: 'schema',
  toolIdempotencyLabel: 'idempotency',
  noActionsYet: 'No actions available yet.',
  localModels: {
    title: 'On-device models',
    hint: 'Download a model to run the agent locally. Stored in your profile — not bundled with the app.',
    recommended: 'Recommended',
    selected: 'In use',
    use: 'Use',
    download: 'Download',
    delete: 'Delete',
    empty: 'No models available.',
    paramsUnit: 'B',
    ctxUnit: 'ctx',
  },
  dangerLabels: {
    read: 'reads',
    state_changing: 'changes page',
    destructive: 'destructive',
    financial: 'financial',
  },
  // AIAdaptor groups: system-adaptor titles (keyed by adaptor id) + the per-group kind badge labels.
  adaptors: {
    browser: 'Browser',
    file: 'File operations',
    journal: 'Journal & audit',
    extensions: 'Extensions',
  },
  adaptorKinds: {
    system: 'System',
    extension: 'Extension',
    mcp: 'MCP',
  },

  // --- Connections / MCP ---
  connectionsTitle: 'Connections',
  connectionsSubtitle:
    'Model Context Protocol (MCP) servers. Their tools become available to the agent through the security policy. Add servers in preferences; editing here arrives in a later release.',
  adaptorInventoryTitle: 'Adaptors',
  adaptorInventorySubtitle:
    'MCP, REST, GraphQL, OAuth service, and local/native adaptors visible to the agent policy.',
  adaptorInventoryEmpty: 'No adaptors available yet.',
  adaptorAuditRequired: 'Audit',
  adaptorToolsLabel: 'tools',
  adaptorKindLabels: {
    mcp: 'MCP',
    rest: 'REST',
    graphql: 'GraphQL',
    oauth_service: 'OAuth service',
    local: 'Local',
  },
  adaptorStateLabels: {
    not_configured: 'Not configured',
    connected: 'Connected',
    revoked: 'Revoked',
    error: 'Error',
  },
  adaptorAuthLabels: {
    oauth: 'OAuth',
    api_key: 'API key',
    local: 'Local',
    none: 'No account',
  },
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
  sitePermissionClipboardRead: 'Clipboard read',
  sitePermissionClipboardWrite: 'Clipboard write',
  permissionReset: 'Reset',

  // --- Passwords ---
  passwordsTitle: 'Passwords',

  // --- Developer ---
  developerTitle: 'Developer',
  developerDesc:
    'Development-only editor for the current top-level settings object. Values are validated by the normal preferences schema.',
  developerSearchPlaceholder: 'Search settings keys',
  developerApply: 'Apply',
  developerEdit: 'Edit',
  developerSaved: 'Developer setting saved.',
  developerSaveFailed: 'Could not save this setting.',
  developerInvalidJson: 'Invalid JSON.',
  developerPublic: 'Public',
  developerPrivate: 'Private',
  developerType: 'Type',
  developerValue: 'Current value',
  developerColumnKey: 'Key',
  developerColumnVisibility: 'Visibility',
  developerColumnType: 'Type',
  developerColumnValue: 'Value',
  developerColumnActions: 'Actions',

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
      items: ['Open a new tab', 'Continue where you left off', 'Open specific pages'],
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
      items: [
        'Autonomy / approval level',
        'Token-budget cap',
        'Model routing',
        'Per-tool permissions',
      ],
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
