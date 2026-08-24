import type { WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import { isWebUrl } from './lib/navigation-url';
import DownloadService from './downloads/download-service.electron';

/**
 * The page commands that act on ONE browsed `WebContents`: print, save, view-source.
 *
 * Free functions over a webContents rather than methods on the tab model, for the same reason
 * `handleZoomShortcut` is: they are reachable from two places that cannot import each other. The
 * right-click menu route goes through `WindowTabsNav`, which is deep inside the tab-model graph; the
 * keyboard route goes through `keyboard-shortcuts.ts`, which `tabs-view-wiring.ts` imports — so a tab
 * import there closes a real cycle (dependency-cruiser's `no-circular`, measured, not guessed).
 *
 * Keeping the behaviour here also means the two routes cannot drift: before this, only the menu could
 * reach them at all.
 */

/**
 * Open the system print dialog for this page.
 *
 * The failure path is the reason this is not a one-liner. `webContents.print()` called with no
 * callback reports nothing at all — no throw, no return value — so a print that never happened was
 * indistinguishable from one that did. A user cancelling the dialog is NOT a failure and is logged as
 * the ordinary outcome it is; anything else is a warning with the reason Chromium gave.
 */
export function printPage(wc: WebContents | null): void {
  if (wc === null || wc.isDestroyed()) return;
  wc.print({}, (success, failureReason) => {
    if (success) return;
    if (failureReason === 'cancelled') {
      Logger.debug('Print dialog cancelled');
      return;
    }
    Logger.warn('Print failed', { reason: failureReason });
  });
}

/** Save the page through the central DownloadService (quarantine + audit), as a user-actor download. */
export function savePage(wc: WebContents | null): void {
  if (wc === null || wc.isDestroyed()) return;
  DownloadService.downloadURL(wc, wc.getURL(), { actor: 'user' });
}

/** Open this page's HTML source in place (Chrome's `view-source:`). Web pages only. */
export function viewSourcePage(wc: WebContents | null): void {
  if (wc === null || wc.isDestroyed()) return;
  const url = wc.getURL();
  if (!isWebUrl(url)) return; // internal pages (tepegoz://…) have no source to show
  void wc.loadURL(`view-source:${url}`).catch((err: unknown) => {
    Logger.warn('View-source navigation failed', { err: String(err) });
  });
}
