import { z } from 'zod';
import { EXTENSION_ID_RE } from '@tepegoz/extension-sdk';
import {
  BrowsingDataCategorySchema,
  ChromiumFlagOverridesSchema,
  NetworkConnectionSchema,
  NetworkGeneralBindingSchema,
  isNavigableWebUrl,
  isSafeSearchTemplate,
} from '@tepegoz/shared-types';
import {
  AGENT_EFFORT_LEVELS,
  FILE_ACCESS_MODES,
  LOCALE_PREFS,
  MCP_TRANSPORTS,
  NEWTAB_BG_KINDS,
  NEWTAB_IMAGE_FITS,
  PROVIDER_IDS,
  RESOLVED_LOCALES,
  SITE_PERMISSION_STATES,
  THEME_PREFS,
  type Preferences,
  type PublicSettings,
} from '@tepegoz/desktop-ipc';

/**
 * App preferences validation (main-side). The TYPE and its value lists live in the shared IPC contract
 * (zod-free, so the sandboxed preload can use it); each z.enum below is BUILT from the contract's
 * canonical array — one list per union, no re-spelling — and the `satisfies` check below pins the
 * whole object shape.
 */
export const ThemePrefSchema = z.enum(THEME_PREFS);
export const LocalePrefSchema = z.enum(LOCALE_PREFS);
export const ProviderPrefSchema = z.enum(PROVIDER_IDS);
// Reverse-DNS extension id — shares the exact rule the SDK enforces on manifests (single source).
export const ExtensionIdSchema = z.string().regex(EXTENSION_ID_RE);
export const ExtensionStatusSchema = z.enum(['enabled', 'disabled']);
export const ExtensionStateSchema = z.object({
  id: ExtensionIdSchema,
  status: ExtensionStatusSchema,
});

// One MCP server config. stdio needs a command; http_sse (reserved for Phase 1b) needs a url.
export const McpServerPrefSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(64),
    transport: z.enum(MCP_TRANSPORTS),
    command: z.string().min(1).max(1024).optional(),
    args: z.array(z.string().max(1024)).max(64).optional(),
    env: z.record(z.string().max(4096)).optional(),
    url: z.string().url().max(2048).optional(),
    enabled: z.boolean(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.transport === 'stdio' && (cfg.command === undefined || cfg.command.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stdio requires "command"',
        path: ['command'],
      });
    }
    if (cfg.transport === 'http_sse' && cfg.url === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'http_sse requires "url"',
        path: ['url'],
      });
    }
  });

export const PreferencesSchema = z.object({
  theme: ThemePrefSchema,
  // Custom single-color theme (hex) or '' to follow the mode. Lenient; the UI validates/normalizes.
  themeColor: z.string().max(32),
  locale: LocalePrefSchema,
  telemetryEnabled: z.boolean(),
  useLocalModelForSimpleTasks: z.boolean(),
  // On-device provider participation + selected downloaded model (keyless; see @tepegoz/local-inference).
  localProvider: z.object({
    mode: z.enum(['off', 'simple', 'default']),
    selectedModelId: z.string().max(64),
  }),
  // Per-action "run locally" overrides: action (tool) id → run-on-device. Only affects localCapable actions.
  localActions: z.record(z.string().max(64), z.boolean()),
  // Agent panel per-run provider override (null = default resolution); autonomy level (default safe).
  agentProviderOverride: ProviderPrefSchema.nullable(),
  // Agent panel per-provider model pin, keyed provider id → model id (absent/'' = auto/tiered routing).
  // When set for the resolved provider it overrides ALL tiers for the run (plan/exec/classify).
  agentModelOverride: z.record(z.string().max(64), z.string().max(64)),
  agentAutonomy: z.enum(['ask', 'act', 'auto', 'dangerous']),
  agentEffort: z.enum(AGENT_EFFORT_LEVELS),
  // S6 PR5: hardened inbound guard. `setStrictMode` landed in C7 and was UNREACHABLE — no caller ever
  // set it, so the mode could not be turned on at all. This is that caller's source of truth. Default
  // OFF, because a browsing agent legitimately needs to read most page data and redacting it by default
  // would break ordinary tasks to defend against an uncommon one.
  agentStrictGuard: z.boolean(),
  // Account-wide total-token quota (input+output) across runs; 0 = unlimited/off. Drives the Token
  // Ledger quota indicator, the 80% warning, and the pre-flight budget gate. Private (no public projection).
  agentTokenQuota: z.number().int().min(0).max(1_000_000_000),
  // Derived from the credential vault's key order (top key's provider) and synced by main; no UI.
  defaultProvider: ProviderPrefSchema,
  // Region/date/search are lenient strings (validated/normalized at the UI); unknown values are harmless.
  region: z.string().max(16),
  dateFormat: z.string().max(16),
  searchEngineId: z.string().max(64),
  // First-run welcome sentinel. Private: not exposed to extensions.
  onboardingCompleted: z.boolean(),
  // User-added search engines. The template must carry `{q}` AND resolve to an http/https URL once it
  // is filled in — `{q}` alone was the whole check, and `javascript:alert(1)?q={q}` passes that.
  customSearchEngines: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(64),
        searchUrlTemplate: z
          .string()
          .min(1)
          .max(2048)
          .refine(isSafeSearchTemplate, 'searchUrlTemplate must be an http(s) URL containing {q}'),
      }),
    )
    .max(50),
  // Phase 5 network privacy. The connection list and the profile-wide default binding; both validated
  // with the SAME schemas the rest of the app uses (`@tepegoz/shared-types`), so a connection id that
  // could collide with another partition cannot be persisted in the first place.
  networkConnections: z.array(NetworkConnectionSchema).max(32),
  networkGeneralBinding: NetworkGeneralBindingSchema,
  // Helper-binary overrides (wireproxy / tor). Blank = look in `userData/bin`, then PATH.
  networkBinaries: z.object({
    wireproxy: z.string().max(1024),
    tor: z.string().max(1024),
  }),
  // Home / new-tab page URL. Lenient string (validated/normalized at the UI); a blank value falls back
  // to the built-in default at the navigation site.
  // '' = no homepage (a new tab opens blank); anything else must be a real http/https address, since
  // this string is navigated to on every new tab, the Home button and a blank omnibox submit.
  homepageUrl: z
    .string()
    .max(2048)
    .refine((v) => v === '' || isNavigableWebUrl(v), 'homepageUrl must be an http(s) URL'),
  // Show the bookmarks bar strip under the nav toolbar (toggled from the Bookmarks menu).
  showBookmarksBar: z.boolean(),
  // New-tab shortcut tiles — the user's own list, independent of bookmarks. Capped at one Chrome-style
  // grid (two rows of five).
  newTabShortcuts: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        title: z.string().max(256),
        url: z.string().min(1).max(2048),
      }),
    )
    .max(10),
  // New-tab background: kind (default surface / solid color / uploaded image), the color + optional SVG
  // pattern id for 'color', the cas:// blob ref for 'image', and a 0..1 dimness (background opacity).
  newTabBackground: z.object({
    kind: z.enum(NEWTAB_BG_KINDS),
    color: z.string().max(32),
    svgId: z.string().max(64),
    imageRef: z.string().max(128),
    imageFit: z.enum(NEWTAB_IMAGE_FITS),
    imagePositionX: z.number().min(0).max(100),
    imagePositionY: z.number().min(0).max(100),
    imageZoom: z.number().min(1).max(4),
    opacity: z.number().min(0).max(1),
  }),
  // Browser downloads. Empty directory means "use the OS Downloads folder"; main canonicalizes before
  // persisting any user-picked directory.
  downloadDirectory: z.string().max(1024),
  downloadAskEachTime: z.boolean(),
  /**
   * Categories cleared when the browser closes. Empty (the default) is off.
   *
   * Reuses the "Clear browsing data" categories rather than inventing a second list: two vocabularies
   * for the same act is how one of them ends up quietly narrower than the other.
   */
  clearOnExit: z.array(BrowsingDataCategorySchema).max(8),
  /**
   * How long a finished download stays in the list. `manual` is the default and the only one that
   * never deletes anything on its own — a download list that quietly empties itself is a list the
   * user cannot rely on to answer "did I download that?".
   */
  downloadHistoryRetention: z.enum(['manual', 'after-day', 'on-completion']),
  /** Open the transfers panel when a download finishes. Chrome's shelf behaviour, as a preference. */
  showDownloadsWhenDone: z.boolean(),
  // Required (not .default) so the schema input matches Preferences; init always merges the default
  // (extensions: []) first, and PreferencesPatchSchema (.partial) makes it optional on read/patch.
  extensions: z.array(ExtensionStateSchema),
  // Toolbar-pinned extension ids, IN TOOLBAR ORDER (the array order is the icon order, so a drag-
  // reorder just rewrites it). Reuses the manifest id rule; unknown/disabled ids are ignored by the UI.
  pinnedExtensions: z.array(ExtensionIdSchema).max(64),
  // Active User-Agent override for browsed pages (User-Agent switcher extension); null = default.
  userAgent: z.string().max(512).nullable(),
  // External MCP servers whose tools the agent may use (routed through the ToolGateway PEP).
  mcpServers: z.array(McpServerPrefSchema),
  // Master switch for native OS + in-app notifications.
  notificationsEnabled: z.boolean(),
  // Per-origin web-capability grants (Web Notification API consent). Keyed by origin.
  sitePermissions: z.record(
    z.string().max(2048),
    z.object({
      notifications: z.enum(SITE_PERMISSION_STATES).optional(),
      clipboardRead: z.enum(SITE_PERMISSION_STATES).optional(),
      clipboardWrite: z.enum(SITE_PERMISSION_STATES).optional(),
    }),
  ),
  // Per-origin page zoom, keyed by origin → zoom FACTOR (1 = 100%). Only non-default origins are
  // stored; resetting to 100% deletes the key, so this cannot grow into a record of every site visited.
  siteZoomFactors: z.record(z.string().max(2048), z.number().min(0.25).max(5)),
  // Popup Blocker (strict) settings — block popups by default, allowing only trusted origins.
  popupBlocker: z.object({
    enabled: z.boolean(),
    showNotifications: z.boolean(),
    trustedOrigins: z.array(z.string().max(2048)).max(500),
  }),
  // Adblock Shield settings. Filter-list cache/state and recent blocked URLs are kept outside prefs.
  adblock: z.object({
    enabled: z.boolean(),
    blockingMode: z.literal('ads-and-trackers'),
    cosmeticFiltering: z.boolean(),
    disabledOrigins: z.array(z.string().max(2048)).max(500),
  }),
  // Safe Browsing protection (ADR-0043). On by default; off makes the whole feature inert (no prefix
  // DB refresh, no Google full-hash request, no navigation check, downloads settle `unknown`).
  safeBrowsingEnabled: z.boolean(),
  // Typo extension settings. Dictionaries are profile files, not preference payloads.
  typo: z.object({
    enabled: z.boolean(),
    autoDetectLanguage: z.boolean(),
    languages: z.array(z.string().min(1).max(16)).max(20),
    defaultLanguage: z.string().min(1).max(16),
    localLlmMode: z.enum(['off', 'auto']),
    externalAiMode: z.enum(['off', 'manual']),
    disabledOrigins: z.array(z.string().max(2048)).max(500),
    ignoredWords: z
      .array(
        z.object({
          word: z.string().min(1).max(200),
          language: z.string().min(1).max(16),
        }),
      )
      .max(2000),
  }),
  // Translate extension settings. Translation memory is kept outside preferences.
  translate: z.object({
    enabled: z.boolean(),
    autoTranslateForeignPages: z.boolean(),
    targetLanguageMode: z.literal('app-locale'),
    displayMode: z.literal('replace'),
    engineMode: z.literal('local-first'),
    cloudFallbackMode: z.enum(['ask', 'allow', 'deny']),
    disabledOrigins: z.array(z.string().max(2048)).max(500),
    glossaryTerms: z
      .array(
        z.object({
          id: z.string().min(1).max(128),
          source: z.string().min(1).max(200),
          target: z.string().min(1).max(200),
          sourceLanguage: z.string().min(1).max(16).optional(),
          targetLanguage: z.string().min(1).max(16).optional(),
          caseSensitive: z.boolean(),
        }),
      )
      .max(1000),
  }),
  // Unified Player (ext-video-player) settings. Per-tab skinned-video counts stay session-only.
  videoPlayer: z.object({
    enabled: z.boolean(),
    defaultSpeed: z.number().min(0.25).max(4),
    subtitleFontSize: z.enum(['sm', 'md', 'lg', 'xl']),
    theme: z.enum(['light', 'dark', 'auto']),
    autoHideControls: z.boolean(),
    enableKeyboard: z.boolean(),
    disabledOrigins: z.array(z.string().max(2048)).max(500),
    siteScales: z.record(z.string().max(2048), z.number().min(0.5).max(3)),
  }),
  // One-time sentinel: true once the curated default trusted origins have been seeded (see the host's
  // PopupBlockerManager.init), so a user who removes a default never gets it back on next launch.
  popupBlockerSeeded: z.boolean(),
  // File operations: master switch + the folder whitelist (each folder has a permission mode). The
  // FILE_ACCESS_MODES enum is the single source shared with @tepegoz/file-operations. `path` is an
  // absolute, canonical folder; main resolves/validates it before persisting.
  fileOperationsEnabled: z.boolean(),
  fileAccessGrants: z
    .array(
      z.object({
        path: z.string().min(1).max(1024),
        mode: z.enum(FILE_ACCESS_MODES),
        recursive: z.boolean(),
      }),
    )
    .max(100),
  fileAccessSeeded: z.boolean(),
  // Translucent "glass" chrome (Win11 Mica). Private — not projected to PublicSettings.
  glassChrome: z.boolean(),
  // Last main-window placement (restored on next launch); null = fresh profile → default size, centered.
  windowBounds: z
    .object({
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      maximized: z.boolean(),
    })
    .nullable(),
  // Close-to-tray + power behavior (device-local; private — not projected to PublicSettings).
  closeToTray: z.boolean(),
  keepAwakeInTray: z.boolean(),
  pauseTasksOnSleep: z.boolean(),
  startupMode: z.enum(['window', 'background', 'kiosk']),
  // '' until kiosk mode is chosen. Loaded fullscreen with no chrome, so it gets the same scheme check
  // as the homepage — there is no address bar in kiosk mode to notice a wrong one with.
  kioskUrl: z
    .string()
    .max(4096)
    .refine((v) => v === '' || isNavigableWebUrl(v), 'kioskUrl must be an http(s) URL'),
  launchAtLogin: z.boolean(),
  trayHintShown: z.boolean(),
  tabDiscardEnabled: z.boolean(),
  // Bounded: a value of 0 would discard a tab the instant it loses focus, and an absurdly large one is
  // indistinguishable from "off" but without the honest label.
  tabDiscardIdleMinutes: z.number().int().min(1).max(1440),
  // GPU compositing. Read straight from `preferences.json` before `whenReady` (hardware-acceleration-boot.ts)
  // because Chromium decides this once, at startup — which is also why the settings toggle says a
  // restart is needed instead of pretending the change is live.
  hardwareAccelerationEnabled: z.boolean(),
  // Accessibility. `defaultPageZoom` is the factor a site gets when it has no per-site level of its
  // own; the bounds match `siteZoomFactors` so the two cannot disagree about what is representable.
  defaultPageZoom: z.number().min(0.25).max(5),
  // Forces reduced motion ON regardless of the OS setting. The OS setting is honoured either way —
  // this is the escape hatch for a machine whose OS says one thing and whose user wants another.
  reduceMotion: z.boolean(),
  // Chromium flag overrides (Developer settings, dev-only — ADR-0041). `z.record` over the allowlist
  // enum: an unknown key fails here, so a hand-edited preferences.json cannot slip a flag past the
  // allowlist. Absent key ⇒ flag off.
  chromiumFlags: ChromiumFlagOverridesSchema,
}) satisfies z.ZodType<Preferences>;

/** Patch shape for partial updates — only provided keys are applied. */
export const PreferencesPatchSchema = PreferencesSchema.partial();

export type PreferencesPatch = z.infer<typeof PreferencesPatchSchema>;

/**
 * Boundary validator for the curated PUBLIC settings the main process sends to extensions. The object
 * schema strips any extra key, so even a buggy projection can't leak a private field. Built from the
 * SAME canonical enums as the preferences schema (no drift); `satisfies` pins it to `PublicSettings`.
 * The `resolvedLocale` enum comes from the shared `RESOLVED_LOCALES` list. Keep the public field set in
 * sync with `PUBLIC_SETTING_KEYS` (guarded by the test below).
 */
export const PublicSettingsSchema = z.object({
  theme: ThemePrefSchema,
  themeColor: z.string().max(32),
  locale: LocalePrefSchema,
  telemetryEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
  useLocalModelForSimpleTasks: z.boolean(),
  defaultProvider: ProviderPrefSchema,
  resolvedLocale: z.enum(RESOLVED_LOCALES),
}) satisfies z.ZodType<PublicSettings>;

export type { Preferences };

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
  // Battery-friendly power defaults: pause background work on sleep, but don't force-keep-awake in tray.
  keepAwakeInTray: false,
  pauseTasksOnSleep: true,
  // Normal foreground window by default; opt in to background/kiosk.
  startupMode: 'window',
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
};
