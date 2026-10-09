import type { Preferences } from '@tepegoz/desktop-ipc';

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  themeColor: '',
  locale: 'system',
  telemetryEnabled: false,
  useLocalModelForSimpleTasks: false,
  localProvider: { mode: 'off', selectedModelId: '' },
  localActions: {},
  agentProviderOverride: null,
  agentModelOverride: {},
  agentAutonomy: 'ask',
  agentEffort: 'high',
  agentStrictGuard: false,
  agentTokenQuota: 0,
  defaultProvider: 'anthropic',
  region: '',
  dateFormat: 'medium',
  searchEngineId: 'google',
  onboardingCompleted: false,
  customSearchEngines: [],
  networkConnections: [],
  networkGeneralBinding: { kind: 'direct' },
  networkBinaries: { wireproxy: '', tor: '' },
  homepageUrl: 'https://duckduckgo.com/',
  showBookmarksBar: true,
  showHomeButton: true,
  newTabShortcuts: [],
  newTabBackground: {
    kind: 'default',
    color: '#1e293b',
    svgId: '',
    imageRef: '',
    imageFit: 'cover',
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
    opacity: 1,
  },
  downloadDirectory: '',
  downloadAskEachTime: false,
  clearOnExit: [],
  downloadHistoryRetention: 'manual',
  showDownloadsWhenDone: true,
  crashReportingEnabled: false,
  extensions: [],
  pinnedExtensions: [],
  userAgent: null,
  mcpServers: [],
  notificationsEnabled: true,
  sitePermissions: {},
  siteZoomFactors: {},
  popupBlocker: { enabled: true, showNotifications: true, trustedOrigins: [] },
  adblock: {
    enabled: true,
    blockingMode: 'ads-and-trackers',
    cosmeticFiltering: true,
    disabledOrigins: [],
  },
  // Safe Browsing protection on by default (ADR-0043). Inert until the desktop service + a Google
  // Safe Browsing API key are wired; the honest default is still "on".
  safeBrowsingEnabled: true,
  // HTTPS-only on tunneled partitions: on by default.
  httpsOnlyOnTunnel: true,
  typo: {
    enabled: true,
    autoDetectLanguage: true,
    languages: ['tr', 'en'],
    defaultLanguage: 'tr',
    localLlmMode: 'auto',
    externalAiMode: 'manual',
    disabledOrigins: [],
    ignoredWords: [],
  },
  translate: {
    enabled: true,
    autoTranslateForeignPages: true,
    targetLanguageMode: 'app-locale',
    displayMode: 'replace',
    engineMode: 'local-first',
    cloudFallbackMode: 'ask',
    disabledOrigins: [],
    glossaryTerms: [],
  },
  videoPlayer: {
    enabled: true,
    defaultSpeed: 1,
    subtitleFontSize: 'md',
    theme: 'auto',
    autoHideControls: true,
    enableKeyboard: true,
    disabledOrigins: [],
    siteScales: { 'https://www.youtube.com': 1.4 },
  },
  // Seeded once by the main-process host (union of the curated defaults); starts empty + unseeded here.
  popupBlockerSeeded: false,
  fileOperationsEnabled: true,
  // Seeded lazily by the main-process host (needs os.homedir()); starts empty + unseeded here.
  fileAccessGrants: [],
  fileAccessSeeded: false,
  // Glass chrome on by default; the main process only applies Mica when the OS supports it (Win11).
  glassChrome: true,
  // No saved placement yet — the first launch uses the default size, OS-centered on the primary screen.
  windowBounds: null,
  // Close (X) → tray so the browser keeps running (and the agent keeps driving tabs) in the background.
  closeToTray: true,
  // Off by default: closing a window stays one click unless the user opts into the warning.
  confirmCloseMultiTab: false,
  // Battery-friendly power defaults: pause background work on sleep, but don't force-keep-awake in tray.
  keepAwakeInTray: false,
  pauseTasksOnSleep: true,
  // Normal foreground window by default; opt in to background/kiosk.
  startupMode: 'window',
  // A normal launch continues where the last session left off (the long-standing behaviour).
  startupTabs: 'restore',
  // Strip order is the long-standing browser default; most-recently-used is opt-in.
  tabSwitchOrder: 'positional',
  kioskUrl: '',
  // Do not auto-start at system login by default.
  launchAtLogin: false,
  // The one-time tray hint hasn't been shown yet.
  trayHintShown: false,
  // Cap memory from forgotten background tabs by default; 30 minutes matches Chrome's own memory-saver
  // default, which is the behavior a daily-driver user already expects.
  tabDiscardEnabled: true,
  hardwareAccelerationEnabled: true,
  defaultPageZoom: 1,
  reduceMotion: false,
  tabDiscardIdleMinutes: 30,
  // No Chromium flags overridden on a fresh profile — every allowlisted flag sits at its Chromium default.
  chromiumFlags: {},
  // The hardened baseline: the in-tab PDF viewer on, background throttling off.
  webContentDefaults: { plugins: true, backgroundThrottling: false },
};
