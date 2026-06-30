import { z } from 'zod';

/**
 * App preferences contract (single source for the preference store + future IPC validation).
 * Kept main-side (zod); the renderer/preload get a plain type via the IPC contract in a later slice.
 */
export const ThemePrefSchema = z.enum(['system', 'light', 'dark']);
export const LocalePrefSchema = z.enum(['system', 'en', 'tr']);
export const ProviderPrefSchema = z.enum(['anthropic', 'openai', 'gemini']);

export const PreferencesSchema = z.object({
  theme: ThemePrefSchema,
  locale: LocalePrefSchema,
  telemetryEnabled: z.boolean(),
  /** Cost-saver: route simple capabilities to the local SLM (real routing lands in Phase 1b). */
  useLocalModelForSimpleTasks: z.boolean(),
  defaultProvider: ProviderPrefSchema,
});

/** Patch shape for partial updates — only provided keys are applied. */
export const PreferencesPatchSchema = PreferencesSchema.partial();

export type Preferences = z.infer<typeof PreferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  locale: 'system',
  telemetryEnabled: false,
  useLocalModelForSimpleTasks: false,
  defaultProvider: 'anthropic',
};
