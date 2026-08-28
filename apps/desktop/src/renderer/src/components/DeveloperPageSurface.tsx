import { useEffect, useState } from 'react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { effectiveLocale } from '../App-helpers';
import { applyTheme } from '../lib/theme';
import { DeveloperSection } from './settings-developer';

/**
 * Desktop host for `tepegoz://developer` — the Developer surface (Chromium flags + the raw preferences
 * editor) as its own real page. Unlisted: no menu links here, but any user can reach it by typing the
 * URL, deliberately, like Chrome's `chrome://flags` (ADR-0041). Unlike the `tepegoz://settings#developer`
 * section it is NOT gated to development builds — the page IS the "advanced user opted in by typing it"
 * gate.
 *
 * Mirrors `SettingsPageSurface`'s pattern: this document owns its own bridge fetch, locale and theme.
 */
export function DeveloperPageSurface() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);

  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        setPrefs(p);
        applyTheme(p.theme, p.themeColor);
      },
      () => {
        /* bridge unavailable (should not happen inside a real WebContentsView) */
      },
    );
  }, []);

  // Keep prefs fresh when another window/tab changes them — main broadcasts on every prefs write.
  useEffect(() => {
    return window.tepegoz.onPublicSettingsChanged(() => {
      void window.tepegoz.getPreferences().then(setPrefs, () => {
        /* bridge unavailable — keep the last known prefs */
      });
    });
  }, []);

  async function onUpdatePrefs(patch: Partial<Preferences>): Promise<void> {
    setPrefs(await window.tepegoz.updatePreferences(patch));
  }

  const locale = effectiveLocale(prefs?.locale ?? 'system');

  return (
    <I18nProvider locale={locale}>
      <div className="absolute inset-0 overflow-auto bg-surface-system">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {prefs ? (
            <DeveloperSection prefs={prefs} onUpdatePrefs={onUpdatePrefs} />
          ) : (
            <p className="text-sm text-text-secondary">…</p>
          )}
        </div>
      </div>
    </I18nProvider>
  );
}
