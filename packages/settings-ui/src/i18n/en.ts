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
  glassHint:
    'Make the tab bar and toolbar translucent, showing your desktop through them (Windows 11).',

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

  // --- System tray & power ---
  tray: {
    title: 'System tray & power',
    closeToTray: 'Close to tray',
    closeToTrayDesc:
      'Closing the window keeps Tepegöz running in the system tray, so background tabs and the agent keep working. Quit from the tray icon menu.',
    keepAwake: 'Keep active in the tray',
    keepAwakeDesc:
      'Prevent the system from suspending Tepegöz while it runs in the tray. More reliable for background work, at a higher battery cost.',
    pauseOnSleep: 'Pause on sleep',
    pauseOnSleepDesc:
      'Pause background agent work when the system sleeps or switches to battery / power-save, and resume it when the system wakes.',
    startupMode: 'Startup mode',
    startupModeDesc:
      'How Tepegöz opens on every launch — and when auto-started at login. All modes keep tabs rendering.',
    modeWindow: 'Window',
    modeBackground: 'Background (system tray)',
    modeKiosk: 'Kiosk (fullscreen, no chrome)',
    kioskUrl: 'Kiosk URL',
    kioskUrlPlaceholder: 'https://example.com',
    launchAtLogin: 'Launch at system startup',
    launchAtLoginDesc:
      'Start Tepegöz automatically when you sign in to your computer (Windows / macOS / Linux). The auto-launch starts in the background so the agent is ready from boot.',
  },

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
    kimi: 'Kimi (Moonshot)',
    local: 'Local (on-device)',
  },
  keyModel: {
    label: 'Model',
    auto: 'Auto (recommended)',
    /** The gear button's own compact label when the key is on auto. */
    autoShort: 'Auto',
    hint: 'Use the gear on a key to pick the model it runs on — a key’s model applies while it is the topmost key of its provider.',
    menuHint: 'Model for this key',
    saved: 'Model updated.',
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
  tokenBudget: {
    title: 'Token budget',
    desc: 'Cap total token spend across agent runs. The Agent Console shows a live indicator and warns at 80%; a new run is blocked once the cap is reached. Runs that fail for reasons outside your control (system errors, CAPTCHA/2FA, loops) are auto-refunded.',
    label: 'Total token quota (0 = unlimited)',
    used: 'Used so far',
  },
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
  // "Forget this site" (Phase 2). The warnings are the point of the feature: a clear that silently
  // signs someone out of a site they were using is the kind of help that costs trust everywhere else.
  forgetSite: {
    title: 'Forget a site',
    desc: 'Remove one site’s cookies, storage, caches and service workers in a single step.',
    placeholder: 'example.com',
    review: 'Review',
    confirmFor: 'This will clear everything {site} has stored on this device.',
    confirm: 'Forget it',
    cleared: 'Cleared everything stored by {site}.',
    vaultUntouched: 'Saved passwords are not deleted — they stay in your password manager.',
    warning: {
      signs_you_out: 'You will be signed out of this site.',
      holds_saved_credentials: 'Your password manager has a login saved for this site.',
      has_offline_data: 'Offline features on this site will stop working until you reload it.',
    },
  },
  clearHistoryDesc: 'Remove the list of pages you have visited on this device.',
  clearHistoryButton: 'Clear history',
  historyCleared: 'Browsing history cleared.',

  // --- Scoped trust profiles ---
  siteTrust: {
    title: 'Site trust',
    subtitle:
      'The standing posture the AI agent uses on a site. A profile can only ever make things stricter — it never unlocks anything.',
    empty: 'No sites have a trust setting. Every site uses the default.',
    addPlaceholder: 'example.com',
    addLabel: 'Site',
    addHint: 'The domain only — no https:// and no path. Subdomains inherit.',
    add: 'Add',
    remove: 'Remove',
    levelLabel: 'Level',
    levels: {
      trusted: 'Trusted',
      default: 'Default',
      restricted: 'Restricted',
    },
    levelHelp: {
      trusted: 'Ordinary changes proceed without asking.',
      default: 'The standard rules apply.',
      restricted: 'Ask me about everything here, including reads.',
    },
    ceiling:
      'Even on a trusted site: deleting, spending money, anything driven by the page’s own content, and every banking, crypto, password or health site still ask — or stay blocked.',
    invalidDomain: 'Enter a domain like example.com — no scheme, no path.',
  },

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
  // --- Network privacy (Phase 5): per-tab / per-group routing through a local SOCKS endpoint ---
  network: {
    title: 'Network privacy',
    intro:
      'Route a tab or a whole tab group through WireGuard, Tor, or a SOCKS5 endpoint you already run. Tepegöz does not provide the tunnel itself, and nothing is routed through one unless you choose it.',
    defaultRoute: 'Default route',
    defaultRouteHint:
      'Applies to every tab that has no route of its own and is not in a group with one. Changing it reloads the affected tabs.',
    direct: 'Direct (no tunnel)',
    connections: 'Connections',
    noConnections: 'No connections added yet.',
    notedAs: 'Noted as: {note}',
    remove: 'Remove',
    removeHint:
      'Removing a connection also erases the cookies and cache of every page that used it, and sends its tabs back to the default route.',
    statusUp: 'connected',
    statusDown: 'not connected',
    statusConnecting: 'connecting',
    labelPlaceholder: 'Name',
    notePlaceholder: 'Note (e.g. Tor, Mullvad SE)',
    portPlaceholder: 'Port',
    portInvalid: 'Enter a port between 1 and 65535.',
    add: 'Add',
    kindLabel: 'Type',
    nameLabel: 'Name',
    noteLabel: 'Note',
    portLabel: 'Port',
    profileLabel: 'Profile',
    chooseFile: 'Choose .conf…',
    pickedSummary: 'Endpoint {endpoint} · DNS {dns}',
    connect: 'Connect',
    disconnect: 'Disconnect',
    protocolWireguard: 'WireGuard',
    protocolTor: 'Tor',
    protocolByo: 'SOCKS',
    chainedVia: 'via {name}',
    keychainBody:
      'A WireGuard profile contains a private key, so it can only be imported when the operating system can encrypt it. Nothing will be written in plain text.',
    torUpstream: 'Upstream connection',
    torUpstreamNone: 'Straight to Tor',
    torUpstreamVia: 'Through {name}',
    binaryMissing:
      '{name} was not found. Put it in {dir}, or give its full path below. Tepegöz does not ship it.',
    helpersHint:
      'WireGuard and Tor connections run these two programs. Tepegöz does not ship them — it looks for them in the usual install locations and on PATH, or you can point at the folder you keep them in.',
    binaryAutoDetected: '(found automatically)',
    binaryBrowse: 'Browse…',
    binaryChange: 'Change…',
    binaryClear: 'Clear',
  },
};

export type SettingsStrings = typeof en;
