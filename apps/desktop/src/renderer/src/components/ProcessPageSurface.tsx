import { I18nProvider } from '@tepegoz/i18n/react';
import { ProcessPage } from '@tepegoz/process-ui';
import { useSurfaceLocale } from '../app-surface-locale';

/** Desktop host for `tepegoz://process` (the Task Manager) loaded as a real page — mirrors
 *  `DownloadsPageSurface.tsx`'s pattern. The page polls `getProcessMetrics` on its own interval. */
export function ProcessPageSurface() {
  const locale = useSurfaceLocale();

  return (
    <I18nProvider locale={locale}>
      <div className="absolute inset-0 bg-surface-system">
        <ProcessPage
          poll={() => window.tepegoz.getProcessMetrics()}
          end={(tabId) => window.tepegoz.endTabProcess(tabId)}
        />
      </div>
    </I18nProvider>
  );
}
