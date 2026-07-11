/**
 * The public/private classification of every preference — the ONE place this decision is made. Lives
 * here (not in shared-types) because it is keyed by `keyof Preferences`, and `Preferences` is defined
 * in this package. `SETTINGS_VISIBILITY` is typed as `Record<keyof Preferences, …>`, so adding a new
 * preference is a COMPILE ERROR until it is explicitly classified (fail-closed — a forgotten key can
 * never silently leak to extensions).
 *
 * The shared `PublicSettings` SHAPE lives in @tepegoz/shared-types (so extension packages can import
 * it without a dependency cycle); the guards below pin that shape to the real projection of
 * `Preferences`, so if a public preference's type ever drifts, this file fails to build. Zod-free /
 * preload-safe. The runtime zod validator (`PublicSettingsSchema`) is built in
 * `@tepegoz/preferences` (main-only), alongside `PreferencesSchema`.
 */
import type { Preferences } from './contract';
import type { PublicSettings } from '@tepegoz/shared-types/public-settings';

export type {
  PublicSettings,
  SettingsHostApi,
  PublicThemePref,
  PublicLocalePref,
  ResolvedLocale,
} from '@tepegoz/shared-types/public-settings';
export { RESOLVED_LOCALES } from '@tepegoz/shared-types/public-settings';

/** The preference keys exposed to extensions. The single source for the projection + the schema. */
export const PUBLIC_SETTING_KEYS = [
  'theme',
  'themeColor',
  'locale',
  'telemetryEnabled',
  'notificationsEnabled',
  'useLocalModelForSimpleTasks',
  'defaultProvider',
] as const satisfies readonly (keyof Preferences)[];

export type PublicSettingKey = (typeof PUBLIC_SETTING_KEYS)[number];

/**
 * Fail-closed classification of EVERY preference. `Record<keyof Preferences, …>` forces every key to
 * appear; a new preference won't compile until it is marked here. Keep the `'public'` entries in sync
 * with `PUBLIC_SETTING_KEYS` (guarded by the runtime test in @tepegoz/preferences).
 */
export const SETTINGS_VISIBILITY: Record<keyof Preferences, 'public' | 'private'> = {
  theme: 'public',
  themeColor: 'public',
  locale: 'public',
  telemetryEnabled: 'public',
  useLocalModelForSimpleTasks: 'public',
  defaultProvider: 'public',
  notificationsEnabled: 'public',
  // Private — not (yet) part of the public surface; flip to 'public' if extensions should read them.
  region: 'private',
  dateFormat: 'private',
  searchEngineId: 'private',
  onboardingCompleted: 'private',
  customSearchEngines: 'private',
  homepageUrl: 'private',
  showBookmarksBar: 'private',
  // Private — new-tab personalization (the user's shortcut list + background); extensions have no need.
  newTabShortcuts: 'private',
  newTabBackground: 'private',
  downloadDirectory: 'private',
  downloadAskEachTime: 'private',
  // Private — secret-adjacent or a browsing/footprint signal that must never reach an extension.
  extensions: 'private',
  userAgent: 'private',
  mcpServers: 'private',
  sitePermissions: 'private',
  popupBlocker: 'private',
  adblock: 'private',
  typo: 'private',
  translate: 'private',
  popupBlockerSeeded: 'private',
  // Private — on-device model config/footprint; the public cost-saver bool above is enough for extensions.
  localProvider: 'private',
  localActions: 'private',
  // Private — agent panel per-run selections (provider + model override + autonomy + effort) + token quota.
  agentProviderOverride: 'private',
  agentModelOverride: 'private',
  agentAutonomy: 'private',
  agentEffort: 'private',
  agentTokenQuota: 'private',
  // Private — local file-access configuration (a filesystem footprint that must never reach an extension).
  fileOperationsEnabled: 'private',
  fileAccessGrants: 'private',
  fileAccessSeeded: 'private',
  // Private — a purely cosmetic window-chrome preference; extensions have no need for it.
  glassChrome: 'private',
  // Private — the user's window placement; a UI/footprint detail extensions have no need for.
  windowBounds: 'private',
};

// --- Compile-time guards: pin the shared PublicSettings shape to the real Preferences projection. ---
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** The public-key projection of Preferences (what the shape must equal, minus `resolvedLocale`). */
type PublicProjection = Pick<Preferences, PublicSettingKey>;
/** If a public preference's type drifts from `PublicSettings`, this resolves to `false` and the
 *  assignment below fails to compile. Exported so it is not flagged as unused. */
export const PUBLIC_SETTINGS_MATCHES_PREFERENCES: Equal<
  Omit<PublicSettings, 'resolvedLocale'>,
  PublicProjection
> = true;
