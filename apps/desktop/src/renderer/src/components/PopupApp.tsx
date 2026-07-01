import { useEffect, useState } from 'react';
import { resources, resolveLocale, type Locale } from '@tepegoz/i18n';
import type { ThemePref } from '@tepegoz/desktop-ipc';
import { extensionDefById } from '../extensions/registry';

/**
 * Standalone render target for a native extension popup window (loaded with `?popup=<id>`). It renders
 * ONLY that extension's `popup` surface — no browser chrome — filling the frameless popup window that
 * floats over the live page. Talks to the host through the same `window.tepegoz` bridge; closes via its
 * own Close button, Escape, or losing focus (handled in the main process).
 */
function applyTheme(theme: ThemePref): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export function PopupApp({ id }: { id: string }) {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme);
        setLocale(p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language));
      },
      () => {
        /* bridge unavailable — fall back to defaults */
      },
    );
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closeExtensionPopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const def = extensionDefById(id);
  const Surface = def?.surfaces.popup;
  if (def === undefined || Surface === undefined) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
      <div className="min-h-0 flex-1 overflow-auto">
        <Surface t={resources[locale]} onClose={() => window.tepegoz.closeExtensionPopup()} />
      </div>
    </div>
  );
}
