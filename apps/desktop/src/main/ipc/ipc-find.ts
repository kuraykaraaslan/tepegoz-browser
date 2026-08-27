import { IpcChannels } from '@tepegoz/desktop-ipc';
import { FindInPageQuerySchema, ZoomCommandSchema } from '@tepegoz/desktop-ipc/schemas';
import TabManager from '../tabs';
import { runFindInPage, stopFindInPage } from '../find-in-page';
import { onWindowAction, onWindowSignal } from './ipc-helpers';

/**
 * Active-tab page-command IPC — find-in-page (Ctrl+F, Phase 2c) and the omnibox zoom indicator
 * (Phase 2c). Its own file rather than more weight in `ipc-tabs-windows.ts`, which already runs past
 * the ADR-0010 250-line cap.
 *
 * Every channel here is window-scoped and fire-and-forget: it always targets the SENDER window's
 * active tab, so one window's find bar or zoom control can never reach into another window's page.
 * Internal (`tepegoz://`) tabs have no WebContents of their own and are simply a no-op.
 */
export function registerFindIpc(): void {
  onWindowAction(IpcChannels.findStart, FindInPageQuerySchema, (win, query) => {
    const wc = TabManager.forSenderWindow(win)?.activeWebContents() ?? null;
    if (wc !== null) runFindInPage(win, wc, query);
  });

  onWindowSignal(IpcChannels.findStop, (win) => {
    stopFindInPage(TabManager.forSenderWindow(win)?.activeWebContents() ?? null);
  });

  // The zoom indicator's −, +, Reset. The new factor is not pushed on its own channel — `zoomActive`
  // re-emits `tabs:state`, which already carries `activeZoomFactor`.
  onWindowAction(IpcChannels.zoomCommand, ZoomCommandSchema, (win, { direction }) => {
    TabManager.forSenderWindow(win)?.zoomActive(direction);
  });
}
