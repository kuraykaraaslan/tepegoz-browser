import { useEffect, useState } from 'react';
import { resources, resolveLocale, type Locale } from '@tepegoz/i18n';
import type {
  CredentialsStatus,
  LocalePref,
  Preferences,
  ProviderId,
  ThemePref,
} from '../../shared/ipc-contract';
import { SettingsPage } from './components/SettingsPage';

function effectiveLocale(pref: LocalePref): Locale {
  if (pref === 'en' || pref === 'tr') return pref;
  return resolveLocale(navigator.language);
}

function applyTheme(theme: ThemePref): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export function App() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [status, setStatus] = useState<CredentialsStatus | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // try/catch (not .catch) so a MISSING bridge (window.tepegoz undefined → synchronous throw)
        // degrades gracefully too, not just async IPC rejections.
        const [p, s] = await Promise.all([
          window.tepegoz.getPreferences(),
          window.tepegoz.getCredentialsStatus(),
        ]);
        setPrefs(p);
        setStatus(s);
      } catch {
        // Preload bridge unavailable (dev mishap) — leave nulls; the minimal fallback renders.
      }
    })();
  }, []);

  const theme = prefs?.theme ?? 'system';
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, [theme]);

  const locale = effectiveLocale(prefs?.locale ?? 'system');
  const t = resources[locale];

  async function onUpdatePrefs(patch: Partial<Preferences>): Promise<void> {
    setPrefs(await window.tepegoz.updatePreferences(patch));
  }
  async function onSetKey(provider: ProviderId, apiKey: string): Promise<void> {
    setStatus(await window.tepegoz.setProviderKey(provider, apiKey));
  }
  async function onRemoveKey(provider: ProviderId): Promise<void> {
    setStatus(await window.tepegoz.removeProviderKey(provider));
  }

  return (
    <div className="min-h-screen bg-surface-base text-text-primary">
      <header className="flex items-center border-b border-border px-6 py-3">
        <h1 className="text-base font-semibold">{t.common.appName}</h1>
      </header>
      {prefs && status ? (
        <SettingsPage
          t={t}
          prefs={prefs}
          status={status}
          onUpdatePrefs={onUpdatePrefs}
          onSetKey={onSetKey}
          onRemoveKey={onRemoveKey}
        />
      ) : (
        <p className="px-6 py-8 text-sm text-text-secondary">…</p>
      )}
    </div>
  );
}
