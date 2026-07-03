import { useEffect, useState } from 'react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { PublicSettings, ResolvedLocale } from '@tepegoz/desktop-ipc';
import { extensionDefById } from '../extensions/registry';
import { applyTheme } from '../lib/theme';

/**
 * Standalone render target for a native extension popup window (loaded with `?surface=ext&id=<id>`). It renders
 * ONLY that extension's `popup` surface — no browser chrome — filling the frameless popup window that
 * floats over the live page. Talks to the host through the same `window.tepegoz` bridge; closes via its
 * own Close button, Escape, or losing focus (handled in the main process).
 *
 * Reads theme + language from the PUBLIC settings surface (the same read-only projection exposed to
 * extensions) and subscribes to live changes, so a popup follows a theme/locale switch without a
 * restart — parity with the main App tree's `I18nProvider`.
 */
export function PopupApp({ id }: { id: string }) {
  const [locale, setLocale] = useState<ResolvedLocale>('en');

  useEffect(() => {
    const apply = (s: PublicSettings): void => {
      applyTheme(s.theme, s.themeColor);
      setLocale(s.resolvedLocale);
    };
    void window.tepegoz.getPublicSettings().then(apply, () => {
      /* bridge unavailable — fall back to defaults */
    });
    const unsubscribe = window.tepegoz.onPublicSettingsChanged(apply);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unsubscribe();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const def = extensionDefById(id);
  const Surface = def?.surfaces.popup;
  if (def === undefined || Surface === undefined) return null;

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <Surface onClose={() => window.tepegoz.closePopup()} />
        </div>
      </div>
    </I18nProvider>
  );
}
