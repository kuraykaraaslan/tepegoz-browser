import { useEffect, useState } from 'react';
import type { Locale } from '@tepegoz/i18n';
import { effectiveLocale } from './App-helpers';
import { applyTheme } from './lib/theme';

/**
 * Locale + theme bootstrap shared by every standalone `tepegoz://` surface host (history, downloads,
 * uploads, bookmarks, extensions, settings — each its own top-level document, not a branch of
 * `App-content.tsx`): fetch prefs once, apply the theme immediately so there is no flash, resolve the
 * locale, and stay in sync when prefs change from ANY window (`onPublicSettingsChanged`, the same signal
 * `App-effects.ts` uses for the main chrome).
 */
export function useSurfaceLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    const apply = (): void => {
      void window.tepegoz.getPreferences().then(
        (p) => {
          applyTheme(p.theme, p.themeColor);
          setLocale(effectiveLocale(p.locale));
        },
        () => undefined,
      );
    };
    apply();
    return window.tepegoz.onPublicSettingsChanged(apply);
  }, []);

  return locale;
}
