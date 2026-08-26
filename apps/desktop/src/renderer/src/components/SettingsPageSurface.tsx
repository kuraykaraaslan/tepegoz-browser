import { useCallback, useEffect, useState } from 'react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { CredentialsStatus, LoginCredentialMeta, Preferences, ProviderId } from '@tepegoz/desktop-ipc';
import { effectiveLocale, internalPageHash } from '../App-helpers';
import { applyTheme } from '../lib/theme';
import { SettingsPage } from './SettingsPage';

/**
 * Desktop host for `tepegoz://settings` loaded as a REAL page (Faz 1/2 of
 * `phases/tracks/protocol-tepegoz-pages.md`), mirroring `OnboardingApp.tsx`'s pattern: this document is
 * its own top-level `WebContentsView`, not a branch of `App-content.tsx`'s render tree, so it owns its
 * own bridge fetch, locale and theme — nothing is threaded in as props.
 *
 * Reuses the existing `SettingsPage` presentational component unchanged; only the data-fetching glue
 * that `App.tsx`/`App-content.tsx` used to provide is re-created here, scoped to this document.
 */
export function SettingsPageSurface() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [loginCredentials, setLoginCredentials] = useState<LoginCredentialMeta[]>([]);

  useEffect(() => {
    void Promise.all([window.tepegoz.getPreferences(), window.tepegoz.getCredentialsStatus()]).then(
      ([p, s]) => {
        setPrefs(p);
        setStatus(s);
        applyTheme(p.theme, p.themeColor);
      },
      () => {
        /* bridge unavailable (should not happen inside a real WebContentsView) — render with defaults */
      },
    );
  }, []);

  // Keep prefs fresh when ANOTHER window/tab changes them — main broadcasts on every prefs write, the
  // same signal `App-effects.ts` listens for.
  useEffect(() => {
    return window.tepegoz.onPublicSettingsChanged(() => {
      void window.tepegoz.getPreferences().then(setPrefs, () => {
        /* bridge unavailable — keep the last known prefs */
      });
    });
  }, []);

  const refreshLogins = useCallback(async (): Promise<void> => {
    try {
      setLoginCredentials(await window.tepegoz.listLogins());
    } catch {
      setLoginCredentials([]);
    }
  }, []);

  async function onUpdatePrefs(patch: Partial<Preferences>): Promise<void> {
    setPrefs(await window.tepegoz.updatePreferences(patch));
  }
  async function onResetPrefs(): Promise<void> {
    setPrefs(await window.tepegoz.resetPreferences());
  }
  async function onAddKey(provider: ProviderId, label: string, apiKey: string): Promise<void> {
    setStatus(await window.tepegoz.addProviderKey(provider, label, apiKey));
  }
  async function onRemoveKeyById(id: string): Promise<void> {
    setStatus(await window.tepegoz.removeProviderKeyById(id));
  }
  async function onRenameKey(id: string, label: string): Promise<void> {
    setStatus(await window.tepegoz.renameProviderKey(id, label));
  }
  async function onSetKeyModel(id: string, model: string): Promise<void> {
    setStatus(await window.tepegoz.setProviderKeyModel(id, model));
  }
  async function onReorderKeys(orderedIds: string[]): Promise<void> {
    setStatus(await window.tepegoz.reorderProviderKeys(orderedIds));
    // The top key defines the default provider; main synced it, so refresh prefs too.
    setPrefs(await window.tepegoz.getPreferences());
  }

  const locale = effectiveLocale(prefs?.locale ?? 'system');

  return (
    <I18nProvider locale={locale}>
      <div className="absolute inset-0 bg-surface-system">
        {prefs && status ? (
          <SettingsPage
            initialSectionId={internalPageHash(window.location.href)}
            prefs={prefs}
            status={status}
            onUpdatePrefs={onUpdatePrefs}
            onResetPrefs={onResetPrefs}
            onAddKey={onAddKey}
            onRemoveKeyById={onRemoveKeyById}
            onRenameKey={onRenameKey}
            onSetKeyModel={onSetKeyModel}
            onReorderKeys={onReorderKeys}
            loginCredentials={loginCredentials}
            onLoginSectionMount={refreshLogins}
            onAddLogin={(c) =>
              window.tepegoz.setLogin(c).then(async () => {
                await refreshLogins();
              })
            }
            onRemoveLogin={(id) =>
              window.tepegoz.removeLogin(id).then(async () => {
                await refreshLogins();
              })
            }
            onImportLogins={(data, fmt) =>
              window.tepegoz.importLogins(data, fmt).then(async (r) => {
                await refreshLogins();
                return r;
              })
            }
            onExportLogins={(fmt) => window.tepegoz.exportLogins(fmt)}
          />
        ) : (
          <p className="px-6 py-8 text-sm text-text-secondary">…</p>
        )}
      </div>
    </I18nProvider>
  );
}
