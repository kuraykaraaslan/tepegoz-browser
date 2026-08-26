import { I18nProvider } from '@tepegoz/i18n/react';
import { DownloadsPage } from '@tepegoz/downloads-ui';
import { useSurfaceLocale } from '../app-surface-locale';

/** Desktop host for `tepegoz://downloads` loaded as a real page (Faz 3 of
 *  phases/tracks/protocol-tepegoz-pages.md) — mirrors `SettingsPageSurface.tsx`'s pattern. */
export function DownloadsPageSurface() {
  const locale = useSurfaceLocale();

  return (
    <I18nProvider locale={locale}>
      <div className="absolute inset-0 bg-surface-system">
        <DownloadsPage
          list={() => window.tepegoz.listDownloads()}
          command={(input) => window.tepegoz.commandDownload(input)}
          subscribe={(callback) => window.tepegoz.onDownloadsState(callback)}
        />
      </div>
    </I18nProvider>
  );
}
