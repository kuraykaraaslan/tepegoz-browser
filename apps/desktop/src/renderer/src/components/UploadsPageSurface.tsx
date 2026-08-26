import { I18nProvider } from '@tepegoz/i18n/react';
import { UploadsPage } from '@tepegoz/uploads-ui';
import { useSurfaceLocale } from '../app-surface-locale';

/** Desktop host for `tepegoz://uploads` loaded as a real page (Faz 3 of
 *  phases/tracks/protocol-tepegoz-pages.md) — mirrors `SettingsPageSurface.tsx`'s pattern. */
export function UploadsPageSurface() {
  const locale = useSurfaceLocale();

  return (
    <I18nProvider locale={locale}>
      <div className="absolute inset-0 bg-surface-system">
        <UploadsPage
          list={() => window.tepegoz.listUploads()}
          command={(input) => window.tepegoz.commandUpload(input)}
          subscribe={(callback) => window.tepegoz.onUploadsState(callback)}
        />
      </div>
    </I18nProvider>
  );
}
