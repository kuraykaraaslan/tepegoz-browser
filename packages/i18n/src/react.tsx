import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './index';
import { pick, type Dict } from './dict';

/**
 * React i18n runtime. The current `Locale` lives in context; each package/extension calls `useT(itsDict)`
 * to self-localize — no string prop-drilling. Kept behind the `@tepegoz/i18n/react` subpath so the main
 * process and backend packages (which import only `@tepegoz/i18n`) never pull React.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Provides the active locale to everything below it. Both `App` and `PopupApp` must be wrapped. */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}): ReactNode {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** The active locale from context (falls back to the default when no provider is mounted). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The caller's dictionary resolved to the active locale (with `en` fallback). */
export function useT<T>(dict: Dict<T>): T {
  return pick(dict, useLocale());
}
