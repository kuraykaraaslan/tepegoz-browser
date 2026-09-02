import { useEffect, useState } from 'react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { resolveLocale, type Locale } from '@tepegoz/i18n';
import { OnboardingSurface } from '@tepegoz/onboarding-ui';
import { applyTheme } from '../lib/theme';
import { useWindowMaximized } from '../lib/useWindowMaximized';

/** Desktop host for the first-run onboarding package. Owns Electron bridge/theme/window concerns. */
export function OnboardingApp() {
  const [locale, setLocale] = useState<Locale>('en');
  const isMaximized = useWindowMaximized();

  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme, p.themeColor);
        setLocale(
          p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language),
        );
      },
      () => {
        /* bridge unavailable - fall back to defaults */
      },
    );
  }, []);

  return (
    <I18nProvider locale={locale}>
      <OnboardingSurface
        isMaximized={isMaximized}
        onMinimize={() => window.tepegoz.minimizeWindow()}
        onToggleMaximize={() => window.tepegoz.toggleMaximizeWindow()}
        onClose={() => window.tepegoz.closeWindow()}
        platform={window.tepegoz.platform}
        importBookmarks={(input) => window.tepegoz.importBookmarks(input)}
        detectBrowserProfiles={() => window.tepegoz.detectBrowserProfiles()}
        importBookmarkProfile={(id) => window.tepegoz.importBookmarkProfile(id)}
        importLogins={(data, format) => window.tepegoz.importLogins(data, format)}
        completeOnboarding={() => window.tepegoz.completeOnboarding()}
      />
    </I18nProvider>
  );
}
