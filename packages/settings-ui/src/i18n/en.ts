/**
 * English is the source shape for this package's own strings; `tr.ts` must match it exactly. The page
 * title is intentionally absent — it reuses the shared-core `common.settings` (no re-translation).
 */
export const en = {
  search: 'Search settings',
  noResults: 'No matching settings',

  // Load / write states for the page shell.
  loading: 'Loading settings…',
  loadFailedTitle: 'Settings could not be loaded',
  loadFailedBody:
    'The browser process did not answer. Nothing was changed, so nothing needs undoing — try again.',
  retry: 'Try again',
  savedIndicator: 'Saved',

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
    tabDiscard: 'Discard inactive tabs',
    tabDiscardDesc:
      "Free memory from background tabs you haven't looked at in a while — the tab stays in the bar and reloads the moment you click back to it. Never applies to the tab you're on, a tab playing sound, or one an agent is keeping alive in the background.",
    tabDiscardIdleMinutes: 'Discard after (minutes)',
  },

  // --- Default browser ---
  defaultBrowser: {
    recheck: 'Check again',
    title: 'Default browser',
    isDefault: 'Tepegöz is your default browser.',
    isDefaultDesc: 'Links from other apps and emails open here.',
    notDefault: 'Tepegöz is not your default browser.',
    notDefaultDesc: 'Links from other apps and emails currently open somewhere else.',
    makeDefault: 'Make Tepegöz my default browser',
    checking: 'Checking…',
    failed: 'Could not register Tepegöz — try setting it from your system settings instead.',
  },

  // --- File operations ---
  fileOps: {
    removeTitle: 'Remove folder access',
    removeBody: 'The assistant loses access to {path}. Nothing on disk is touched, and you can grant it again.',
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
    unlimitedHint: '0 means no cap.',
    title: 'Token budget',
    desc: 'Cap total token spend across agent runs. The Agent Console shows a live indicator and warns at 80%; a new run is blocked once the cap is reached. Runs that fail for reasons outside your control (system errors, CAPTCHA/2FA, loops) are auto-refunded.',
    label: 'Total token quota (0 = unlimited)',
    used: 'Used so far',
  },
  localModels: {
    sizeUnknown: 'size unknown',
    deleteTitle: 'Delete model',
    deleteBody: 'Deletes {name} ({size}) from this computer. Using it again means downloading it again.',
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
  adaptorScopesMore: 'Show all permissions',
  adaptorScopesLess: 'Show fewer',
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
  // ── Permissions Center ─────────────────────────────────────────────────────────────────────────
  // Two halves that must not be confused: site permissions are the user's decisions and are editable;
  // the agent matrix is a VIEW over the Policy Kernel and is not. `agentReadOnly` says why, because a
  // read-only table with no explanation reads like a table that is broken.
  permissionsCenter: {
    forgetSiteBody: 'Forgets every decision stored for {origin}. The site will ask again the next time it needs something.',
    addSite: 'Decide about a site in advance',
    addSiteHint: 'Adds the site so you can set its answers before it ever asks.',
    addSitePlaceholder: 'example.com',
    addSiteButton: 'Add site',
    filter: 'Filter',
    filterPlaceholder: 'Filter by site',
    agentFilterPlaceholder: 'Filter by tool name',
    sitesTitle: 'Site permissions',
    sitesSubtitle: 'What each site may use. Nothing is granted until you say so.',
    sitesEmpty: 'No site has asked for anything yet. This list fills itself as you browse.',
    forgetSite: 'Forget this site',
    // The deliberate absence, stated. A permission the product refuses on purpose should say so
    // rather than simply be missing from a list of everything else.
    screenNote:
      'Screen sharing is not offered. Unlike a camera, one mistaken “allow” would hand over every other window on your screen — including ones this browser does not own.',
    state: { prompt: 'Ask every time', allowed: 'Allow', denied: 'Block' },
    capability: {
      camera: 'Camera',
      microphone: 'Microphone',
      geolocation: 'Location',
      notifications: 'Notifications',
      clipboardRead: 'Read the clipboard',
      clipboardWrite: 'Write to the clipboard',
    },
    agentTitle: 'What the agent may do',
    agentSubtitle:
      'The best case for each tool — a tainted argument or a sensitive site can only tighten it.',
    agentReadOnly:
      'Read-only. These verdicts come from the Policy Kernel, which is the one thing that decides them; changing them here would be a second opinion nobody could tell apart from the real one.',
    agentLoading: 'Reading the policy…',
    agentEmpty: 'No agent tools are registered.',
    decision: { allow: 'Runs', ask: 'Asks first', deny: 'Refused' },
  },
  clientCerts: {
    unavailable: 'The stored decisions could not be read, so this list may be incomplete.',
    title: 'Sites you identified yourself to',
    // Written to be understood by someone who has never heard the phrase "client certificate": what
    // matters to them is that a signed proof of who they are was handed over, and to whom.
    desc: 'A client certificate proves who you are to a site. This run remembers your answer for each site, so you are not asked on every connection.',
    empty: 'No site has asked you for one this run.',
    sent: 'Certificate sent',
    refused: 'Refused — remembered, so you are not asked again',
    forget: 'Forget these answers',
    // The honest limit, stated on the surface itself rather than only in a comment: forgetting changes
    // what happens NEXT. It cannot un-send anything.
    forgetNote:
      'Forgetting only means you will be asked again. A certificate already sent cannot be taken back.',
    forgotten: 'Forgotten. The next request will ask you again.',
    sessionNote: 'These answers are never saved to disk — they are forgotten when you quit.',
  },
  clearHistoryDesc: 'Remove the list of pages you have visited on this device.',
  telemetryNothingSent: 'Nothing is collected or sent in this build — no code reads this setting yet. It is here so the choice is already yours when something does.',
  clearHistoryConfirm: 'Deletes your whole browsing history on this device. Bookmarks, passwords and site permissions are not affected.',
  clearHistoryButton: 'Clear history',
  historyCleared: 'Browsing history cleared.',

  // --- Scoped trust profiles ---
  siteTrust: {
    storedAs: 'Stored as {domain}.',
    update: 'Update',
    removeTitle: 'Remove trust profile',
    removeBody: '{domain} goes back to the default posture: the agent asks before every gated action there.',
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

  // --- Keyboard shortcuts ---
  shortcuts: {
    filterLabel: 'Filter',
    filterPlaceholder: 'Search a command or a key',
    notRebindable: 'These are fixed in this build — there is no rebinding yet, so nothing here is hidden behind a setting.',
    title: 'Keyboard shortcuts',
    subtitle: 'Every global shortcut, from the one registry the app binds them from.',
    /**
     * Keyed by shortcut id. A nested group, not siblings of the strings above: the two used
     * to share one object, so a shortcut whose id happened to be `title` would have rendered
     * this section's own heading as its description, and the parity test that guards against
     * stale rows had to carry a hand-kept list of which keys to ignore.
     */
    descriptions: {
      newTab: 'New tab',
      reopenClosedTab: 'Reopen the last closed tab',
      reload: 'Reload the page',
      settings: 'Open settings',
      commandPalette: 'Open the command palette',
      find: 'Find on the page',
      fullScreen: 'Toggle full screen',
      exitKiosk: 'Leave kiosk mode',
      print: 'Print the page',
      savePage: 'Save the page',
      viewSource: 'View the page source',
      newPrivateWindow: 'Open a new private window',
      devTools: 'Open developer tools',
      hardReload: 'Reload, ignoring the cache',
      closeTab: 'Close the tab',
    },
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
  developerFlagsTitle: 'Chromium flags',
  developerFlagsDesc:
    'Development-only. Toggle an allowlisted Chromium/Electron flag, then relaunch. Only vetted flags appear here — there is no free-form entry, and nothing that weakens page isolation can be listed.',
  developerFlagsRelaunchHint: 'Relaunch Tepegöz to apply flag changes.',
  developerFlagsExperimental: 'Experimental',
  developerFlagName: {
    forceDarkMode: 'Force dark mode',
    forceDarkModeDesc:
      "Render every page with Chromium's auto-dark algorithm, ignoring the site's own theme.",
    parallelDownloading: 'Parallel downloading',
    parallelDownloadingDesc: 'Split large downloads into several concurrent connections.',
    overlayScrollbars: 'Overlay scrollbars',
    overlayScrollbarsDesc:
      'Thin, auto-hiding scrollbars that float over content instead of taking layout width.',
    forceReducedMotion: 'Force reduced motion',
    forceReducedMotionDesc:
      'Report a reduced-motion preference to every page, suppressing non-essential animation.',
    disableGpu: 'Disable GPU acceleration',
    disableGpuDesc:
      'Render entirely on the CPU — useful to rule out a GPU driver as the cause of visual glitches.',
    showFpsCounter: 'Show FPS counter',
    showFpsCounterDesc: "Overlay Chromium's frame-rate / GPU HUD on every page.",
  },

  // --- Reset ---
  resetTitle: 'Reset settings',
  resetDesc:
    'Restore all preferences to their defaults. Saved API keys and passwords are not affected.',
  resetButton: 'Reset to defaults',
  resetConfirm: 'Reset all settings to defaults? Saved keys and passwords are kept.',
  resetDone: 'Settings reset to defaults.',

  // --- About ---
  aboutTitle: 'About',
  aboutVersion: 'Version',
  aboutPlatform: 'Operating system',
  aboutProjectTitle: 'About Tepegöz',
  aboutProjectDesc:
    'Tepegöz is an agentic, security-by-design, local-first web browser built with Electron and TypeScript.',
  aboutAuthorTitle: 'Author',
  authorName: 'Kuray Karaaslan',
  aboutWebsite: 'Website',
  aboutGithub: 'GitHub',
  aboutLinkedin: 'LinkedIn',
  aboutInstagram: 'Instagram',

  // Version & build. Engine names are proper nouns and stay identical in every locale.
  aboutBuildTitle: 'Version and build',
  aboutChannel: 'Channel',
  aboutChannelDev: 'Development build',
  aboutBuildLabel: 'Build',
  aboutBuildUnstamped: 'Not stamped',
  aboutChromium: 'Chromium',
  aboutElectron: 'Electron',
  aboutNode: 'Node.js',
  aboutV8: 'V8',
  aboutCopyDiagnostics: 'Copy diagnostics',
  aboutCopyDiagnosticsHint:
    'Copies the version, engine and build lines above — paste them into a bug report.',
  aboutCopied: 'Copied',
  aboutCopyFailed: 'Could not reach the clipboard.',

  // Updates. This build ships no updater; saying so is the only honest thing this card can do.
  aboutUpdatesTitle: 'Updates',
  aboutUpdatesUnavailable:
    'This build has no automatic updates. New versions are published on the releases page.',

  // License and third-party notices. AGPL-3.0 obliges the app to point its users at the source.
  aboutLegalTitle: 'License and notices',
  aboutLicense: 'License',
  aboutLicenseDesc:
    'Tepegöz is free software licensed under the {license}. You may use, study, share and modify it; if you run a modified version, the same license requires you to offer its source to the people who use it.',
  aboutLicenseText: 'License text',
  aboutThirdPartyTitle: 'Third-party notices',
  aboutThirdPartyDesc:
    'Tepegöz renders with Chromium and Electron. Their license notices ship with the app.',
  aboutThirdPartyOpen: 'Open notices',
  aboutThirdPartyMissing: 'This build ships no notices file — opening the online copy instead.',

  // Project links.
  aboutProjectLinksTitle: 'Project',
  aboutSource: 'Source code',
  aboutReleases: 'Releases',
  aboutDocs: 'Documentation',
  aboutReportIssue: 'Report an issue',
  aboutOpensInNewTab: 'Opens in a new tab',

  // --- Placeholder ("coming soon") sections — pure UI, persist nothing (see ComingSoonCard) ---
  // Downloads / search-engine editing / default-browser recheck / custom-colour contrast readout.
  downloadLocationBrowse: 'Browse…',
  downloadLocationOpen: 'Open folder',
  downloadLocationOpenFailed: 'That folder could not be opened. It may have been moved or deleted.',
  clearDownloadsConfirm: 'Removes every finished, cancelled and failed transfer from the list. The files themselves are not deleted.',
  clearDownloadsResult: '{count} removed from the list.',
  searchEngineEdit: 'Edit',
  searchEngineSave: 'Save',
  searchEngineDuplicate: 'An engine with this name already exists.',
  contrastSample: 'Sample',
  contrastText: 'Text',
  contrastAccent: 'Accent',
  contrastAccentLabel: 'Label on accent',
  contrastTargets: 'WCAG AA needs {text} for text and {nonText} for controls.',

  // --- MCP servers (previously configurable only through the Developer page's raw JSON field) ---
  mcp: {
    title: 'MCP servers',
    subtitle:
      'Model Context Protocol servers extend the agent with tools. A local one runs as a child process; a remote one is reached over HTTP.',
    labelField: 'Name',
    labelPlaceholder: 'Filesystem',
    transport: 'Transport',
    transports: {
      stdio: 'Local process',
      http_sse: 'HTTP (SSE)',
    },
    command: 'Command',
    commandPlaceholder: 'npx',
    args: 'Arguments',
    argsPlaceholder: '-y @modelcontextprotocol/server-filesystem /home',
    url: 'Server URL',
    urlPlaceholder: 'https://example.com/mcp',
    add: 'Add server',
    enabled: 'Enabled',
    empty: 'No MCP servers yet.',
    errorLabel: 'Give the server a name.',
    errorCommand: 'A local server needs a command to run.',
    errorUrl: 'Enter a full http:// or https:// address.',
    removeTitle: 'Remove server',
    removeBody:
      'Removes {name} and the tools it provides. The program itself is not uninstalled, and you can add it again.',
    envNote: 'This server carries environment variables, which stay untouched when you edit it here.',
    envLink: 'Edit them in Developer',
  },

  mcpStateLabels: {
    idle: 'Idle',
    connecting: 'Connecting…',
    ready: 'Ready',
    error: 'Error',
  },
  mcpToolsLabel: 'tools',
  moveUp: 'Move {name} up',
  moveDown: 'Move {name} down',
  keyRemoveTitle: 'Remove key',
  keyRemoveBody:
    'Removes {name}. The key itself is never shown again, so you would have to paste it in from your provider to restore it.',

  // --- Accessibility (was a placeholder while the product claimed WCAG 2.2 AA) ---
  accessibility: {
    title: 'Accessibility',
    subtitle: 'How pages are sized and how much the interface moves.',
    pageZoom: 'Default page zoom',
    pageZoomHint:
      'The level a site gets when you have not set one for it. Zooming a single site still overrides this, and is remembered for that site.',
    perSiteCount: '{count} site(s) have a zoom level of their own.',
    clearPerSite: 'Reset every site',
    clearPerSiteBody:
      'Forgets the zoom level on all {count} of them. They go back to the default above; nothing else changes.',
    reduceMotion: 'Reduce motion',
    reduceMotionDesc:
      'Cut animations and transitions down to nothing. Your system setting is already followed — turn this on if you want less motion than your system asks for.',
    elsewhereTitle: 'Related settings',
    elsewhereHint: 'These change how much you can read too, but they belong to other pages.',
    linkTheme: 'Theme and contrast — Appearance',
    linkShortcuts: 'Keyboard shortcuts',
  },

  // --- On startup (moved out of System tray & power, which is where these used to hide) ---
  startup: {
    title: 'On startup',
    modeWindowDesc: 'Opens a normal browser window.',
    modeBackgroundDesc:
      'Starts in the system tray with no window. Tabs keep rendering and the agent can work before you open anything.',
    modeKioskDesc: 'Opens one address fullscreen with no browser chrome at all.',
    kioskUrlHint: 'There is no address bar in kiosk mode, so this is the only page that will load.',
    urlInvalid: 'Enter a full http:// or https:// address.',
    rangeInvalid: 'Enter a whole number between {min} and {max}.',
    movedHere: 'Startup mode and launch-at-login moved to Preferences → On startup.',
  },

  // --- Agent controls (was a placeholder listing three controls that had already shipped) ---
  agentControls: {
    title: 'Agent controls',
    autonomyHint:
      'How far the agent may go before it stops to ask. Denied actions stay denied at every level.',
    effortHint: 'How much reasoning each step gets. Higher levels cost more tokens.',
    elsewhereTitle: 'Related settings',
    elsewhereHint: 'These control the agent too, but they belong to other pages.',
    linkBudget: 'Token budget — Cost & performance',
    linkRouting: 'Model routing — Providers & API keys',
    linkPermissions: 'Per-tool permissions — Site permissions',
  },

  // --- System (was a placeholder listing two settings that had already shipped) ---
  system: {
    title: 'System',
    subtitle: 'Machine-level behaviour that applies to the whole browser.',
    hardwareAcceleration: 'Use hardware acceleration',
    hardwareAccelerationDesc:
      'Draw pages with the GPU. Turn it off only if you see rendering glitches or driver crashes — software rendering is slower and uses more battery.',
    restartRequired: 'Tepegöz decides this at startup, so the change applies after a restart.',
    restartNow: 'Restart now',
    elsewhereTitle: 'Related settings',
    elsewhereHint: 'These are system-level too, but they belong to other pages.',
    linkLaunchAtLogin: 'Launch at system startup — System tray & power',
    linkProxy: 'Proxy and tunnels — Network privacy',
  },

  coming: {
    autofill: {
      title: 'Autofill',
      description: 'Saved payment methods and addresses.',
      items: ['Payment methods', 'Addresses', 'Password breach check'],
    },
  },
  // --- Network privacy (Phase 5): per-tab / per-group routing through a local SOCKS endpoint ---
  network: {
    routesTitle: 'Where traffic is going',
    routesHint: 'Per-tab and per-group routes are set from the tab and group menus; this is where you can review them.',
    routesGroups: 'Groups',
    routesTabs: 'Tabs',
    routesNoOverrides: 'No tab is on a route of its own — everything follows the default above.',
    routeSource: {
      tab: 'Set on this tab',
      group: 'From its group',
      general: 'From the default',
    },
    routeHeld: 'Held — tunnel down',
    removeTitle: 'Remove connection',
    removeBody: 'Removes {name}. Any tab or group bound to it falls back to the profile default.',
    removeBodyDefault: '{name} is the profile default. Removing it puts ALL unbound traffic back on the direct connection.',
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
