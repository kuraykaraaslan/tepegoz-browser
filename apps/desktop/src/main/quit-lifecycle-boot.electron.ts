import { app } from 'electron';
import { markCleanExit } from './recovery/safe-mode';
import { abortActiveAgentRuns } from './ipc';
import { isQuitting, markQuitting } from './quit-state';
import PreferenceStore from '@tepegoz/preferences';
import { closeDatabase, getDb } from './db/database.electron';
import { clearOnExitNow } from './privacy/clear-on-exit.electron';
import TabManager from './tabs';
import PopupWindowManager from './popup-window';
import McpService from './mcp/supervisor.electron';
import BackgroundConnectionService from './extensions/background-connection.electron';
import SafeBrowsingService from './security/safe-browsing-service.electron';
import TaskService from './tasks/task-service.electron';
import TabDiscardService from './tab-discard-service';

/**
 * App quit orchestration, split out of the app entry: window-all-closed (close-to-tray aware),
 * before-quit teardown in dependency order, and will-quit database close.
 */
export function registerQuitLifecycle(): void {
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return;
    // Background mode: with close-to-tray on, keep the app ALIVE in the tray even when the last window/tab
    // is gone — it quits only from the tray's Quit / the menu's Exit. Clicking the tray reopens a fresh
    // window with a new tab (see showOrOpenApp). A real quit already set the quitting flag, so let it pass.
    if (!isQuitting() && PreferenceStore.getAll().closeToTray) return;
    app.quit();
  });

  // Quit orchestration, in dependency order. before-quit (windows still alive): stop the agent so no
  // tool/journal write races teardown, drop the popup child window, snapshot the session while every
  // tab's webContents can still report its URL. The window 'closed' handler then persists + resets as
  // usual, and will-quit (all windows gone) finally flushes + closes the SQLite connection — after
  // this, getDb() is null and any straggling handler no-ops.
  app.on('before-quit', () => {
    // A real quit is underway — let the window close-interceptor (close-to-tray) allow windows to close.
    markQuitting();
    // Say goodbye to the crash counter FIRST. Everything below this line can throw, and a quit that
    // trips over its own teardown is still a quit the user asked for — not a crash to hold against the
    // next launch.
    markCleanExit();
    abortActiveAgentRuns();
    TaskService.stop();
    TabDiscardService.stop();
    SafeBrowsingService.stop();
    void McpService.stop();
    void BackgroundConnectionService.stop();
    PopupWindowManager.close();
    TabManager.persistNow();
    // Fire-and-forget on purpose: Electron may take the process down mid-clear, and the startup
    // marker is what makes that survivable. A quit the user asked for is never blocked on this.
    clearOnExitNow(getDb());
  });
  app.on('will-quit', () => {
    closeDatabase();
  });
}
