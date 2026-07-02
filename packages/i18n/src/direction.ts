/**
 * Text-direction (RTL-ready) skeleton (Phase 0 i18n infra). Both shipping locales (en/tr) are LTR, but
 * the whole app is wired to read direction from here — so adding a first RTL locale (e.g. `ar`, `fa`,
 * `he`) later is a one-line change in `RTL_LOCALES` plus its dictionary, with no surface refactor. The
 * renderer sets `document.documentElement.dir`; the main process can mirror it on native surfaces.
 *
 * Dependency-free (no import from `./index`) so the `index → direction` re-export stays acyclic;
 * `ALL_SUPPORTED_LTR` (which needs the locale list) is derived in `index.ts` instead.
 */
export type Direction = 'ltr' | 'rtl';

/** Base language subtags that render right-to-left. Extend as RTL locales are added to the app. */
export const RTL_LOCALES: readonly string[] = ['ar', 'fa', 'he', 'ur'];

/** The writing direction for a locale (defaults to `ltr`). Accepts a supported `Locale`, a base
 *  subtag, or any full BCP-47 tag (plain `string` — `Locale | string` collapses to `string`). */
export function localeDir(locale: string): Direction {
  const base = locale.toLowerCase().split('-')[0] ?? '';
  return RTL_LOCALES.includes(base) ? 'rtl' : 'ltr';
}
