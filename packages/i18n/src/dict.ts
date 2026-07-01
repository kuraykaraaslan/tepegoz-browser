import type { Locale } from './index';

/**
 * A per-owner dictionary: one value tree per supported locale. `en` is the source shape; every other
 * locale must match it exactly. Framework-agnostic — no React import — so the main process and backend
 * packages can pick a locale without pulling the React runtime.
 */
export interface Dict<T> {
  en: T;
  tr: T;
}

/**
 * Declare a package/extension's own dictionary. Typing `tr` as the inferred `typeof en` (`T`) reproduces
 * the monolith's parity-as-build-error at per-dict granularity: any missing/extra/renamed Turkish key is
 * a compile error. Identity at runtime (zero cost, tree-shakeable).
 */
export function defineDict<const T>(dict: Dict<T>): Dict<T> {
  return dict;
}

/** Non-React accessor: the value tree for `locale`, falling back to `en` (the source/fallback locale). */
export function pick<T>(dict: Dict<T>, locale: Locale): T {
  return dict[locale] ?? dict.en;
}
