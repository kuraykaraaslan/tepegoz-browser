import { useEffect, useState } from 'react';
import { resources, resolveLocale, type Locale } from '@tepegoz/i18n';

export function App() {
  const [locale] = useState<Locale>(() => resolveLocale(navigator.language));
  const [version, setVersion] = useState('…');
  const t = resources[locale];
  // Defensive: if the preload bridge failed to load, don't blank the whole UI.
  const platform = window.tepegoz?.platform ?? 'unknown';

  useEffect(() => {
    void window.tepegoz?.getAppInfo().then((info) => {
      setVersion(info.version);
    });
  }, []);

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
        color: '#e7e7ea',
        background: '#0b0b0c',
        minHeight: '100vh',
        margin: 0,
      }}
    >
      <h1 style={{ margin: '0 0 8px' }}>{t.common.appName}</h1>
      <p style={{ opacity: 0.85 }}>{t.onboarding.welcome}</p>
      <small style={{ opacity: 0.6 }}>
        v{version} · {platform} · {locale}
      </small>
    </main>
  );
}
