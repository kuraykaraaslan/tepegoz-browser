import { useEffect, useState } from 'react';
import { resources, resolveLocale, type Locale } from '@tepegoz/i18n';

export function App() {
  const [locale] = useState<Locale>(() => resolveLocale(navigator.language));
  const [version, setVersion] = useState('…');
  const t = resources[locale];

  useEffect(() => {
    void window.tepegoz.getAppInfo().then((info) => {
      setVersion(info.version);
    });
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, color: '#e7e7ea' }}>
      <h1>{t.common.appName}</h1>
      <p>{t.onboarding.welcome}</p>
      <small>
        v{version} · {window.tepegoz.platform} · {locale}
      </small>
    </main>
  );
}
