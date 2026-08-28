import { BrowserWindow } from 'electron';
import { Logger } from '@tepegoz/libs';
import TabManager from '../tabs';

/**
 * Undo for session restore — the non-modal half of the answer to Chrome's "Restore pages?" dialog.
 *
 * Chrome ASKS before restoring because the tabs it is about to reopen may be the reason the browser
 * died. Asking costs every user a dialog on a launch they did not care about, so this browser restores
 * first and offers the way back: after an unclean shutdown the restore raises a 6-second toast carrying
 * one action, and taking it closes exactly the tabs the restore opened.
 *
 * "Exactly those" is the load-bearing part. Undo works from the tab ids the restore created, so anything
 * the user opened in the meantime is untouched, and a tab they already closed themselves is simply not
 * there. The closes go through the normal `closeTab` path, which means every undone URL lands in the
 * recently-closed list — undo is reversible in turn, one tab at a time, from the History menu.
 */

/** How long the offer stands. Comfortably longer than the toast that carries it (6 s), short enough that
 *  a stale action can never reach in and close tabs the user has since been working in. */
const UNDO_TTL_MS = 60_000;

interface RestoredWindow {
  windowId: number;
  tabIds: string[];
}

let restored: RestoredWindow[] = [];
let recordedAt = 0;

/** Record what a window's restore actually created. Called once per restored window, by the restore
 *  itself; `tabIds` are the ids `restoreWindow` returned (a blocked `tab:create` contributes none). */
export function recordRestoredTabs(win: BrowserWindow, tabIds: string[]): void {
  if (tabIds.length === 0) return;
  restored.push({ windowId: win.id, tabIds });
  recordedAt = Date.now();
}

/** How many tabs this launch's session restore opened, across every window. */
export function restoredTabCount(): number {
  return restored.reduce((sum, w) => sum + w.tabIds.length, 0);
}

/** Forget the offer (nothing to undo). */
export function clearRestoreUndo(): void {
  restored = [];
}

/**
 * Close the tabs this launch's session restore opened. Idempotent — the record is consumed on the first
 * call, so a double-clicked toast cannot close a second round of tabs.
 */
export function undoSessionRestore(): void {
  const entries = restored;
  restored = [];
  if (entries.length === 0) return;
  if (Date.now() - recordedAt > UNDO_TTL_MS) {
    Logger.info('Ignored a session-restore undo that had expired');
    return;
  }
  const live = entries.flatMap((entry) => {
    const win = BrowserWindow.fromId(entry.windowId);
    if (win === null || win.isDestroyed()) return [];
    const wt = TabManager.forWindow(win);
    return wt === undefined ? [] : [{ wt, tabIds: entry.tabIds }];
  });
  const first = live[0];
  if (first === undefined) return;
  // Seed a blank tab in the first surviving window BEFORE closing anything: closing a window's last tab
  // closes the window, and closing the last window quits the app. Undoing a restore must leave the user
  // in a fresh browser, not in no browser.
  first.wt.createTab();
  let closed = 0;
  for (const { wt, tabIds } of live) {
    for (const id of tabIds) {
      wt.closeTab(id); // no-ops for a tab the user already closed
      closed += 1;
    }
  }
  Logger.info('Session restore undone', { windows: live.length, tabs: closed });
}
