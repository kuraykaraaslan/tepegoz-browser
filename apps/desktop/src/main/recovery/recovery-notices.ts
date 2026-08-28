import type { BrowserWindow } from 'electron';
import { selectPlural } from '@tepegoz/i18n';
import NotificationHost from '../notifications/notification-host';
import { mainLocale, mainStrings } from '../lib/i18n-main';
import { isSafeMode, safeModeReason } from './safe-mode';
import { restoredTabCount } from './session-restore-undo';

/**
 * What the user is TOLD about a recovery, as opposed to what the recovery does.
 *
 * Both notices are non-modal on purpose. Chrome's "Restore pages?" dialog blocks the launch to ask a
 * question the user is badly placed to answer (they do not yet know whether the tabs are the problem),
 * and it charges that dialog to every unclean shutdown, including the ones caused by a power cut. These
 * say what happened, offer the one action worth offering, and get out of the way.
 *
 * Nothing is announced on an ordinary launch: a silent restore is the whole point of always restoring.
 */

/**
 * Run `fn` once the chrome renderer can actually receive a toast. `webContents.send` to a window whose
 * renderer has not yet subscribed is dropped on the floor, and a startup notice is precisely the case
 * where that race is guaranteed rather than unlikely. The small grace after `did-finish-load` covers the
 * gap between the document loading and React's effects running — a notice arriving 300 ms late is
 * invisible; one arriving 30 ms early does not arrive at all.
 */
function afterChromeReady(win: BrowserWindow, fn: () => void): void {
  const run = (): void => {
    setTimeout(() => {
      if (!win.isDestroyed()) fn();
    }, 300);
  };
  if (win.webContents.isLoadingMainFrame()) win.webContents.once('did-finish-load', run);
  else run();
}

/** Announce a safe-mode launch. Goes to the notification center as well as a toast: this is the one
 *  notice a user may need to re-read, because it explains why half the browser is missing. */
export function notifySafeMode(win: BrowserWindow): void {
  if (!isSafeMode()) return;
  const reason = safeModeReason();
  afterChromeReady(win, () => {
    const s = mainStrings().browser;
    NotificationHost.push({
      kind: 'warning',
      source: 'system',
      title: s.safeModeTitle,
      body: reason === 'flag' ? s.safeModeBodyFlag : s.safeModeBodyCrash,
      channels: ['center', 'toast'],
      dedupeKey: 'recovery:safe-mode',
    });
  });
}

/**
 * Announce a session restore that followed an UNCLEAN shutdown, with the undo that makes the restore
 * reversible. Toast-only and deliberately so: the action behind it expires, and an expired button
 * sitting in the notification center forever is a worse answer than no button.
 */
export function notifySessionRestored(win: BrowserWindow): void {
  const count = restoredTabCount();
  if (count === 0) return;
  afterChromeReady(win, () => {
    const locale = mainLocale();
    const s = mainStrings().browser;
    const body = selectPlural(count, locale, {
      one: s.sessionRestoredBodyOne,
      other: s.sessionRestoredBodyOther,
    }).replace('{count}', String(count));
    NotificationHost.push({
      kind: 'info',
      source: 'system',
      title: s.sessionRestoredTitle,
      body,
      channels: ['toast'],
      actions: [
        { id: 'undo-restore', label: s.sessionRestoredUndo, type: 'undo_session_restore' },
      ],
    });
  });
}
