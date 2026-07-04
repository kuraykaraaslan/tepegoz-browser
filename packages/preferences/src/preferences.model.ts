import { z } from 'zod';
import { EXTENSION_ID_RE } from '@tepegoz/extension-sdk';
import {
  LOCALE_PREFS,
  MCP_TRANSPORTS,
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
  // Derived from the credential vault's key order (top key's provider) and synced by main; no UI.
  defaultProvider: ProviderPrefSchema,
  // Region/date/search are lenient strings (validated/normalized at the UI); unknown values are harmless.
  region: z.string().max(16),
  dateFormat: z.string().max(16),
  searchEngineId: z.string().max(64),
  // User-added search engines. `searchUrlTemplate` must contain the `{q}` query placeholder.
  customSearchEngines: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(64),
        searchUrlTemplate: z
          .string()
          .min(1)
          .max(2048)
          .refine((t) => t.includes('{q}'), 'searchUrlTemplate must contain the {q} placeholder'),
      }),
    )
    .max(50),
  // Home / new-tab page URL. Lenient string (validated/normalized at the UI); a blank value falls back
  // to the built-in default at the navigation site.
  homepageUrl: z.string().max(2048),
  // Show the bookmarks bar strip under the nav toolbar (toggled from the Bookmarks menu).
  showBookmarksBar: z.boolean(),
  // Required (not .default) so the schema input matches Preferences; init always merges the default
  // (extensions: []) first, and PreferencesPatchSchema (.partial) makes it optional on read/patch.
  extensions: z.array(ExtensionStateSchema),
  // Active User-Agent override for browsed pages (User-Agent switcher extension); null = default.
  userAgent: z.string().max(512).nullable(),
  // External MCP servers whose tools the agent may use (routed through the ToolGateway PEP).
  mcpServers: z.array(McpServerPrefSchema),
  // Master switch for native OS + in-app notifications.
  notificationsEnabled: z.boolean(),
  // Per-origin web-capability grants (Web Notification API consent). Keyed by origin.
  sitePermissions: z.record(
    z.string().max(2048),
    z.object({ notifications: z.enum(SITE_PERMISSION_STATES).optional() }),
  ),
  // Popup Blocker (strict) settings — block popups by default, allowing only trusted origins.
  popupBlocker: z.object({
    enabled: z.boolean(),
    showNotifications: z.boolean(),
    trustedOrigins: z.array(z.string().max(2048)).max(500),
  }),
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
  defaultProvider: 'anthropic',
  region: '',
  dateFormat: 'medium',
  searchEngineId: 'google',
  customSearchEngines: [],
  homepageUrl: 'https://duckduckgo.com/',
  showBookmarksBar: true,
  extensions: [],
  userAgent: null,
  mcpServers: [],
  notificationsEnabled: true,
  sitePermissions: {},
  popupBlocker: { enabled: true, showNotifications: true, trustedOrigins: [] },
};
