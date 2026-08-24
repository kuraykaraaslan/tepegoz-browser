import type { WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import { mayOpenDevTools, type DevToolsVerdict } from '@tepegoz/security-policy';
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

/** Reload this page. `hard` skips the cache (Ctrl+Shift+R). */
export function reloadPage(wc: WebContents | null, hard = false): void {
  if (wc === null || wc.isDestroyed()) return;
  if (hard) wc.reloadIgnoringCache();
  else wc.reload();
}

/**
 * Toggle DevTools on this page, THROUGH the sensitive-site gate.
 *
 * `devtools-policy.ts` states the guarantee plainly: "nothing that reaches the chrome can open it on a
 * bank". That was not true. Electron installs a default application menu when an app never calls
 * `Menu.setApplicationMenu`, and this app never did — so `Ctrl+Shift+I` was bound to Electron's own
 * `toggleDevTools` role, which acts on the focused webContents directly and consults nothing. The
 * app's own gated entry point (`TabManager.toggleDevTools`) meanwhile had **zero callers**: its comment
 * claimed "Phase 2b menu + F12" and neither existed. The one keyboard shortcut every developer knows
 * was the one path around the gate.
 *
 * The verdict is returned rather than swallowed, for the reason the original gate gives: a shortcut
 * that silently does nothing reads as a broken browser.
 */
export function toggleDevToolsGated(wc: WebContents | null): DevToolsVerdict {
  if (wc === null || wc.isDestroyed()) return { allowed: false, reason: 'no_page' };
  const verdict = mayOpenDevTools(wc.getURL());
  if (!verdict.allowed) {
    Logger.info('Refused to open DevTools', { reason: verdict.reason });
    return verdict;
  }
  if (wc.isDevToolsOpened()) wc.closeDevTools();
  else wc.openDevTools();
  return verdict;
}
