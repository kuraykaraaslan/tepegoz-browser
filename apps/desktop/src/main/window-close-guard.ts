import { dialog, type BrowserWindow } from 'electron';
import { mainStrings } from './lib/i18n-main';

/**
 * "Warn before closing a window with several tabs" (Preferences → System tray & power).
 *
 * Pure decision + one native dialog, kept out of `browser-windows.ts`. The warning is about LOSING tabs, so
 * it only applies when the close would really close the window: while close-to-tray is on the window is
 * merely hidden and every tab keeps running, which is not worth interrupting anybody for. It is also
 * skipped on a real quit (the user already chose to leave) and in eval mode.
 */
export function shouldConfirmClose(input: {
  enabled: boolean;
  closeToTray: boolean;
  quitting: boolean;
  tabCount: number;
}): boolean {
  if (!input.enabled || input.quitting) return false;
  if (input.closeToTray && input.tabCount > 0) return false; // hidden to tray, nothing is lost
  return input.tabCount >= 2;
}

/** Ask the user. Resolves true to close the window; any dismissal (Esc, the window gone) keeps it open. */
export async function confirmCloseWindow(win: BrowserWindow, tabCount: number): Promise<boolean> {
  const t = mainStrings().browser;
  try {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: [t.closeWindowConfirm, t.closeWindowCancel],
      defaultId: 1,
      cancelId: 1,
      message: t.closeWindowTitle,
      detail: t.closeWindowDetail.replace('{count}', String(tabCount)),
    });
    return response === 0;
  } catch {
    return false;
  }
}
