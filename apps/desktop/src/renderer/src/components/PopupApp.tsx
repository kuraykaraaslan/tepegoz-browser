import { Suspense, useEffect, useState } from 'react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { coreDict, pick } from '@tepegoz/i18n';
import type { PublicSettings, ResolvedLocale } from '@tepegoz/desktop-ipc';
import { extensionDefById } from '../extensions/registry';
import { useExtensionCatalog } from '../extensions/useExtensionCatalog';
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
  const { registry } = useExtensionCatalog();

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

  const def = extensionDefById(registry, id);
  const Surface = def?.surfaces.popup;
  if (def === undefined || Surface === undefined) return null;

  const loading = pick(coreDict, locale).common.loading;
  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <Suspense
            fallback={
              <div
                role="status"
                aria-label={loading}
                className="flex h-full w-full items-center justify-center text-sm text-text-muted"
              >
                {loading}
              </div>
            }
          >
            <Surface onClose={() => window.tepegoz.closePopup()} />
          </Suspense>
        </div>
      </div>
    </I18nProvider>
  );
}
