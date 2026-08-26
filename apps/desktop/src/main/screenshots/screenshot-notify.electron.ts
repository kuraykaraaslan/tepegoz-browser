import { formatNumber } from '@tepegoz/i18n';
import { extensionFor } from '@tepegoz/screenshots';
import NotificationHost from '../notifications/notification-host';
import { mainLocale, mainStrings } from '../lib/i18n-main';
import { captureAndStore } from './user-screenshot.electron';

/**
 * Capture, store, and TELL the user — including when nothing was captured.
 *
 * Separate from `user-screenshot.electron.ts` for the same reason `print-to-pdf` is separate from
 * `page-commands`: the capture module is reachable from the tab model's side of the graph and cannot
 * import `NotificationHost`, which imports `TabManager`.
 *
 * A screenshot that silently went nowhere is the failure mode this repo keeps finding. The success
 * notification names the SIZE as well, because the whole reason the WebP path exists is that these
 * files live on the user's disk — a number they can see is what makes that claim checkable.
 */
export async function captureAndNotify(mode: 'viewport' | 'fullPage'): Promise<void> {
  const t = mainStrings().browser;
  const stored = await captureAndStore(mode);
  if (stored === null) {
    NotificationHost.push({
      source: 'system',
      kind: 'error',
      title: t.screenshotFailedTitle,
      body: t.screenshotFailedBody,
      channels: ['center', 'toast'],
    });
    return;
  }
  NotificationHost.push({
    source: 'system',
    kind: 'info',
    title: t.screenshotSavedTitle,
    // The format is stated, not implied: reading `png` here means the WebP encode did not happen,
    // and a field that always claimed WebP would be a field nobody could trust.
    body: t.screenshotSavedBody
      .replace('{size}', formatNumber(Math.round(stored.byteLength / 1024), mainLocale()))
      .replace('{format}', extensionFor(stored.format)),
    channels: ['center', 'toast'],
  });
}
