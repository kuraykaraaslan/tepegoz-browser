import { z } from 'zod';
import type { Preferences } from '../../shared/ipc-contract';

/**
 * App preferences validation (main-side). The TYPE lives in the shared IPC contract (zod-free, so the
 * sandboxed preload can use it); this schema is the runtime validator, kept in sync with the type via
 * the `satisfies` check below.
 */
export const ThemePrefSchema = z.enum(['system', 'light', 'dark']);
export const LocalePrefSchema = z.enum(['system', 'en', 'tr']);
export const ProviderPrefSchema = z.enum(['anthropic', 'openai', 'gemini']);
export const ExtensionIdSchema = z.enum(['agent']);
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
};
