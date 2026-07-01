import { z } from 'zod';
import { EXTENSION_ID_RE } from '@tepegoz/extension-sdk';
import type { Preferences } from '@tepegoz/desktop-ipc';

/**
 * App preferences validation (main-side). The TYPE lives in the shared IPC contract (zod-free, so the
 * sandboxed preload can use it); this schema is the runtime validator, kept in sync with the type via
 * the `satisfies` check below.
 */
export const ThemePrefSchema = z.enum(['system', 'light', 'dark']);
export const LocalePrefSchema = z.enum(['system', 'en', 'tr']);
export const ProviderPrefSchema = z.enum(['anthropic', 'openai', 'gemini']);
// Reverse-DNS extension id — shares the exact rule the SDK enforces on manifests (single source).
export const ExtensionIdSchema = z.string().regex(EXTENSION_ID_RE);
export const ExtensionStatusSchema = z.enum(['enabled', 'disabled']);
export const ExtensionStateSchema = z.object({
  id: ExtensionIdSchema,
  status: ExtensionStatusSchema,
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
};
