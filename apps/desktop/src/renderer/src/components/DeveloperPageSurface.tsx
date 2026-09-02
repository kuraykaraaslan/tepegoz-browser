import { useEffect, useState } from 'react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { effectiveLocale } from '../App-helpers';
import { useAppliedTheme } from '../lib/use-applied-theme';
import { InternalPageLoadFailed, InternalPageLoading } from './InternalPageState';
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    void window.tepegoz.getPreferences().then(
      (p) => {
        if (live) setPrefs(p);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  useAppliedTheme(prefs);

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
      {/* `fixed`, not `absolute`: this is a standalone document whose shell must BE the viewport.
          An `absolute` box is the containing block for any positioned descendant that escapes an
          inner scroll area (a `sr-only` input, a table caption), and such a descendant then counts
          toward the DOCUMENT's scroll height — which let the whole page scroll and slide its own
          header out of view. A `fixed` box is excluded from that scroll height, so it cannot. */}
      <div className="fixed inset-0 overflow-auto bg-surface-system">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {prefs ? (
            <DeveloperSection prefs={prefs} onUpdatePrefs={onUpdatePrefs} />
          ) : failed ? (
            <InternalPageLoadFailed
              onRetry={() => {
                setAttempt((n) => n + 1);
              }}
            />
          ) : (
            <InternalPageLoading />
          )}
        </div>
      </div>
    </I18nProvider>
  );
}
