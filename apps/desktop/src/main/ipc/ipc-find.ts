import { IpcChannels } from '@tepegoz/desktop-ipc';
import { FindInPageQuerySchema } from '@tepegoz/desktop-ipc/schemas';
import TabManager from '../tabs';
import { runFindInPage, stopFindInPage } from '../find-in-page';
import { onWindowAction, onWindowSignal } from './ipc-helpers';

/**
 * Find-in-page IPC domain (Ctrl+F, Phase 2c) — its own file rather than more weight in
 * `ipc-tabs-windows.ts`, which already runs past the ADR-0010 250-line cap.
 *
 * Both channels are window-scoped and fire-and-forget: the search always targets the SENDER window's
 * active tab, so one window's find bar can never reach into another window's page. Internal
 * (`tepegoz://`) tabs have no WebContents of their own and are simply a no-op.
 */
export function registerFindIpc(): void {
  onWindowAction(IpcChannels.findStart, FindInPageQuerySchema, (win, query) => {
    const wc = TabManager.forSenderWindow(win)?.activeWebContents() ?? null;
    if (wc !== null) runFindInPage(win, wc, query);
  });

  onWindowSignal(IpcChannels.findStop, (win) => {
    stopFindInPage(TabManager.forSenderWindow(win)?.activeWebContents() ?? null);
  });
}
