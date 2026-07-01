import { en } from './locales/en';
import type { Resources } from './locales/en';
import { tr } from './locales/tr';
import { defineDict } from './dict';

export type { Resources };

/** en is primary/source + fallback; tr is first-class. Add locales here as they land. */
export const SUPPORTED_LOCALES = ['en', 'tr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const resources: Record<Locale, Resources> = { en, tr };

/** The shared cross-cutting dictionary (common/window/errors) every owner may `useT(coreDict)`. */
export const coreDict = defineDict({ en, tr });

/** The per-owner dictionary primitives (framework-agnostic; React runtime lives in `./react`). */
export { defineDict, pick } from './dict';
export type { Dict } from './dict';

/** Resolve a requested locale (e.g. OS language) to a supported one, falling back to default. */
export function resolveLocale(requested: string | undefined): Locale {
  if (requested === undefined) return DEFAULT_LOCALE;
  const base = requested.toLowerCase().split('-')[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base ?? '')
    ? (base as Locale)
    : DEFAULT_LOCALE;
}
