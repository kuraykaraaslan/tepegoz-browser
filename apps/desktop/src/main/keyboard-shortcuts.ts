import type { BrowserWindow, Input } from 'electron';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { pressFromInput, shortcutFor } from '@tepegoz/shortcuts';
import { exitKioskWindow, toggleFullScreen } from './window';
import { loadBrowser } from './onboarding.electron';

/**
 * App-level keyboard shortcuts handled in the MAIN process, so they work regardless of which webContents
 * has focus (the chrome or a browsed view). Wired from `before-input-event` on both the chrome window and
 * every web view. Returns true when handled (caller should `preventDefault`).
 *   • Ctrl/Cmd+F — open the chrome's find bar. Handled here rather than in the renderer because
 *     the key usually arrives while the PAGE has focus, where the chrome never sees it.
 *   • F11 — toggle fullscreen (ignored while in kiosk).
 *   • Ctrl/Cmd+Shift+Q — leave kiosk: the ONLY escape from a chromeless kiosk. Un-kiosk + reload the
 *     normal chrome (the kiosk tab persists as a normal tab).
 */
export function handleWindowShortcut(win: BrowserWindow, input: Input): boolean {
  if (input.type !== 'keyDown') return false;

  // The combinations themselves live in `@tepegoz/shortcuts`, shared with the renderer, so the two
  // halves cannot drift and a collision between them is a failing test rather than two handlers firing
  // for one press. This file keeps only what is genuinely main's: what each one DOES to a window.
  switch (shortcutFor(pressFromInput(input), 'main')) {
    case 'fullScreen':
      toggleFullScreen(win);
      return true;
    case 'find':
      // The bar lives in the chrome; the chrome decides whether this opens it or just refocuses it.
      win.webContents.send(IpcChannels.findOpen);
      return true;
    case 'exitKiosk':
      if (!win.isKiosk()) return false;
      exitKioskWindow(win); // setKiosk(false)
      loadBrowser(win); // reload chrome WITHOUT ?kiosk → tab strip/toolbar return; the kiosk tab stays
      return true;
    default:
      return false;
  }
}
