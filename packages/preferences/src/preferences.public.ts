import { z } from 'zod';
import { RESOLVED_LOCALES, type PublicSettings } from '@tepegoz/desktop-ipc';
import { LocalePrefSchema, ProviderPrefSchema, ThemePrefSchema } from './preferences.primitives';

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
