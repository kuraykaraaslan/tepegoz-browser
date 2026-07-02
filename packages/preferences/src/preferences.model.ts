import { z } from 'zod';
import { EXTENSION_ID_RE } from '@tepegoz/extension-sdk';
import {
  LOCALE_PREFS,
  MCP_TRANSPORTS,
  PROVIDER_IDS,
  THEME_PREFS,
  type Preferences,
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
  locale: LocalePrefSchema,
  telemetryEnabled: z.boolean(),
  useLocalModelForSimpleTasks: z.boolean(),
  defaultProvider: ProviderPrefSchema,
  // Required (not .default) so the schema input matches Preferences; init always merges the default
  // (extensions: []) first, and PreferencesPatchSchema (.partial) makes it optional on read/patch.
  extensions: z.array(ExtensionStateSchema),
  // Active User-Agent override for browsed pages (User-Agent switcher extension); null = default.
  userAgent: z.string().max(512).nullable(),
  // External MCP servers whose tools the agent may use (routed through the ToolGateway PEP).
  mcpServers: z.array(McpServerPrefSchema),
}) satisfies z.ZodType<Preferences>;

/** Patch shape for partial updates — only provided keys are applied. */
export const PreferencesPatchSchema = PreferencesSchema.partial();

export type PreferencesPatch = z.infer<typeof PreferencesPatchSchema>;

export type { Preferences };

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  locale: 'system',
  telemetryEnabled: false,
  useLocalModelForSimpleTasks: false,
  defaultProvider: 'anthropic',
  extensions: [],
  userAgent: null,
  mcpServers: [],
};
