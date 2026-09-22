import { useEffect, useState } from 'react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { resolveLocale, type Locale } from '@tepegoz/i18n';
import { OnboardingSurface } from '@tepegoz/onboarding-ui';
import { applyTheme } from '../lib/theme';
import { useWindowMaximized } from '../lib/useWindowMaximized';

/** Desktop host for the first-run onboarding package. Owns Electron bridge/theme/window concerns. */
export function OnboardingApp() {
  const [locale, setLocale] = useState<Locale>('en');
  // Mirrors the preference model's own default (`telemetryEnabled: false` in
  // `packages/preferences/src/preferences.model.ts`) so a bridge failure fails toward the same value
  // the app itself ships with, not toward a guess.
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);
  const isMaximized = useWindowMaximized();

  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme, p.themeColor);
        setLocale(
          p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language),
        );
        setTelemetryEnabled(p.telemetryEnabled);
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
        telemetryEnabled={telemetryEnabled}
        importBookmarks={(input) => window.tepegoz.importBookmarks(input)}
        detectBrowserProfiles={() => window.tepegoz.detectBrowserProfiles()}
        importBookmarkProfile={(id) => window.tepegoz.importBookmarkProfile(id)}
        importLogins={(data, format) => window.tepegoz.importLogins(data, format)}
        completeOnboarding={() => window.tepegoz.completeOnboarding()}
      />
    </I18nProvider>
  );
}
