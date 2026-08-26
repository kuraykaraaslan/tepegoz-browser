import { I18nProvider } from '@tepegoz/i18n/react';
import { HistoryPage } from '@tepegoz/history-ui';
import { useSurfaceLocale } from '../app-surface-locale';

/** Desktop host for `tepegoz://history` loaded as a real page (Faz 3 of
 *  phases/tracks/protocol-tepegoz-pages.md) — mirrors `SettingsPageSurface.tsx`'s pattern: its own
 *  document, wired straight to the preload bridge instead of prop-threaded chrome state. */
export function HistoryPageSurface() {
  const locale = useSurfaceLocale();

  return (
    <I18nProvider locale={locale}>
      <div className="absolute inset-0 bg-surface-system">
        <HistoryPage
          list={(q, offset) =>
            q.length === 0
              ? window.tepegoz.getHistory({ offset })
              : window.tepegoz.searchHistory({ query: q, offset })
          }
          remove={(url) => window.tepegoz.deleteHistory(url)}
          clear={() => window.tepegoz.clearHistory()}
        />
      </div>
    </I18nProvider>
  );
}
