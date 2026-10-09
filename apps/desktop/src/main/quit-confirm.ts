import { app, dialog } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import { mainStrings } from './lib/i18n-main';
import TabManager from './tabs';
import { isQuitting, markQuitting } from './quit-state';

/**
 * "Confirm before quitting" (Preferences → System tray & power).
 *
 * Quitting is the one action that closes EVERY window, so it gets its own warning rather than borrowing the
 * per-window one. It applies only to a quit the user did not already decide on: the real-quit paths that
 * set the quitting flag first (relaunch, an update restart) are never asked, and a quit with fewer than two
 * tabs open has nothing worth interrupting anyone for. Eval mode never prompts.
 *
 * Two entry points share one rule. `requestQuit` is for the paths this app owns (the tray's Quit, the
 * menu's Exit); `confirmBeforeQuit` is the `before-quit` backstop for a quit it does not own (the OS menu's
 * Cmd-Q, a session end that asks nicely), which is vetoed, asked about, and re-issued once confirmed.
 */
export function shouldConfirmQuit(input: {
  enabled: boolean;
  quitting: boolean;
  evalMode: boolean;
  tabCount: number;
}): boolean {
  return input.enabled && !input.quitting && !input.evalMode && input.tabCount >= 2;
}

/** Tabs that would be lost: every window's, hidden-to-tray windows included. */
function openTabCount(): number {
  return TabManager.all().reduce((sum, wt) => sum + wt.visibleTabCount(), 0);
}

let asking = false;

/** The native question. Resolves true only on an explicit "Quit"; Esc, dismissal or a failure keeps running. */
async function askToQuit(tabCount: number): Promise<boolean> {
  const t = mainStrings().browser;
  const parent = TabManager.focusedWindow();
  const options = {
    type: 'question' as const,
    buttons: [t.quitConfirm, t.quitCancel],
    defaultId: 1,
    cancelId: 1,
    message: t.quitTitle,
    detail: t.quitDetail.replace('{count}', String(tabCount)),
  };
  try {
    const { response } =
      parent !== null && !parent.isDestroyed()
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options);
    return response === 0;
  } catch {
    return false;
  }
}

function needsConfirmation(): number | null {
  const tabCount = openTabCount();
  return shouldConfirmQuit({
    enabled: PreferenceStore.getAll().confirmQuit,
    quitting: isQuitting(),
    evalMode: process.env.TEPEGOZ_EVAL === '1',
    tabCount,
  })
    ? tabCount
    : null;
}

/** Quit, after asking if the setting says to. Used by the tray's Quit and the menu's Exit. */
export function requestQuit(): void {
  const tabCount = needsConfirmation();
  if (tabCount === null) {
    markQuitting(); // real quit → the window close-interceptor (close-to-tray) stands down
    app.quit();
    return;
  }
  if (asking) return; // a prompt is already up; do not stack another
  asking = true;
  void askToQuit(tabCount).then((ok) => {
    asking = false;
    if (!ok) return;
    markQuitting();
    app.quit();
  });
}

/**
 * The `before-quit` backstop. Returns true when the quit must be VETOED (the caller `preventDefault`s); the
 * question is then asked here and, on "Quit", the quit is re-issued with the flag set so it passes.
 */
export function confirmBeforeQuit(): boolean {
  const tabCount = needsConfirmation();
  if (tabCount === null) return false;
  if (!asking) {
    asking = true;
    void askToQuit(tabCount).then((ok) => {
      asking = false;
      if (!ok) return;
      markQuitting();
      app.quit();
    });
  }
  return true;
}
