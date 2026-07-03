/**
 * The PUBLIC browser-settings surface exposed to extensions — the curated, read-only subset of the
 * app's preferences an extension is allowed to see (theme, language, a few non-sensitive toggles).
 * Private settings (credentials, MCP servers, per-site permissions, …) are NEVER part of this shape,
 * so there is no path for them to reach an extension.
 *
 * This lives in @tepegoz/shared-types (the lowest layer) so BOTH the desktop IPC layer AND extension
 * packages can import it without a dependency cycle (`@tepegoz/desktop-ipc` depends on the extension
 * packages, so the shared shape can't live there). Zod-free / preload-safe, like the rest of this
 * package. The allowlist that decides which preference is public — keyed by `keyof Preferences`, so a
 * new preference is a compile error until classified — lives in `@tepegoz/desktop-ipc` (where
 * `Preferences` is defined), and a guard there pins THIS shape to the real preferences projection.
 */
import type { AIProvider } from './providers';

/** Theme options (mirror of desktop-ipc `THEME_PREFS`; pinned by a guard in desktop-ipc). */
export type PublicThemePref = 'system' | 'light' | 'dark';
/** Language preference options (mirror of desktop-ipc `LOCALE_PREFS`; pinned by a guard). */
export type PublicLocalePref = 'system' | 'en' | 'tr';

/** The concrete, effective UI languages (`system` already resolved to one of these). */
export const RESOLVED_LOCALES = ['en', 'tr'] as const;
export type ResolvedLocale = (typeof RESOLVED_LOCALES)[number];

/** The read-only public settings snapshot handed to extensions. Contains no secret. */
export interface PublicSettings {
  theme: PublicThemePref;
  /** Custom single-color theme (hex) or '' to follow the mode. */
  themeColor: string;
  /** The user's language *preference* (may be `system`). */
  locale: PublicLocalePref;
  telemetryEnabled: boolean;
  notificationsEnabled: boolean;
  useLocalModelForSimpleTasks: boolean;
  /** Which AI vendor is the default (never the key). */
  defaultProvider: AIProvider;
  /** The effective language after resolving `system` — extensions can format data in it without
   *  re-implementing the OS-language fallback. */
  resolvedLocale: ResolvedLocale;
}

/**
 * The host-API contract an extension is written against to read public settings. `window.tepegoz`
 * structurally satisfies it, so the chrome keeps injecting `api={window.tepegoz}` unchanged; an
 * extension opts in by widening its own host-API type to also extend this interface.
 */
export interface SettingsHostApi {
  /** One-shot snapshot of the current public settings. */
  getPublicSettings(): Promise<PublicSettings>;
  /** Subscribe to public-settings changes; returns an unsubscribe function. */
  onPublicSettingsChanged(callback: (settings: PublicSettings) => void): () => void;
}
