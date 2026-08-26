import { useEffect, useState } from 'react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ExtensionId, Preferences } from '@tepegoz/desktop-ipc';
import { effectiveLocale } from '../App-helpers';
import { applyTheme } from '../lib/theme';
import { useExtensionCatalog } from '../extensions/useExtensionCatalog';
import { ExtensionsPage } from './ExtensionsPage';

/**
 * Desktop host for `tepegoz://extensions` loaded as a real page (Faz 3 of
 * phases/tracks/protocol-tepegoz-pages.md) — mirrors `SettingsPageSurface.tsx`'s pattern.
 *
 * One behavior gap versus the old chrome-embedded overlay: disabling an extension there ALSO closed
 * that extension's open sidebar panel/popup in the SAME document (`App.tsx#onToggleExtension`). This is
 * a separate document now and cannot reach into the chrome's panel state directly — disabling from here
 * leaves an already-open panel elsewhere as-is until the user next interacts with it. Not a functional
 * break (the extension IS disabled), just a minor polish gap.
 */
export function ExtensionsPageSurface() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const { registry } = useExtensionCatalog();

  useEffect(() => {
    const apply = (): void => {
      void window.tepegoz.getPreferences().then(
        (p) => {
          setPrefs(p);
          applyTheme(p.theme, p.themeColor);
        },
        () => undefined,
      );
    };
    apply();
    return window.tepegoz.onPublicSettingsChanged(apply);
  }, []);

  function onToggle(id: ExtensionId, enabled: boolean): void {
    const next = (prefs?.extensions ?? []).filter((e) => e.id !== id);
    next.push({ id, status: enabled ? 'enabled' : 'disabled' });
    void window.tepegoz.updatePreferences({ extensions: next }).then(setPrefs, () => undefined);
  }

  const locale = effectiveLocale(prefs?.locale ?? 'system');

  return (
    <I18nProvider locale={locale}>
      <div className="absolute inset-0 bg-surface-system">
        <ExtensionsPage
          locale={locale}
          extensions={registry}
          states={prefs?.extensions ?? []}
          onToggle={onToggle}
        />
      </div>
    </I18nProvider>
  );
}
