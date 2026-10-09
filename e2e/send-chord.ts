import type { ElectronApplication } from '@playwright/test';

/**
 * Press `Ctrl+<key>` in the app's chrome window the way the app's own shortcut layer sees it.
 *
 * Playwright's `page.keyboard.press` goes through the DevTools protocol and, in Electron, never reaches
 * `before-input-event` — which is where every `main`-scope shortcut (`@tepegoz/shortcuts`) is handled — so
 * on some platforms a spec that presses Ctrl+K gets no command palette. `webContents.sendInputEvent`
 * from the main process takes the real input path on every platform, so shortcut specs use this.
 *
 * Down-up for both keys, in order, as a person's fingers do; nothing is left held afterwards.
 */
export async function sendCtrlChord(app: ElectronApplication, key: string): Promise<void> {
  await app.evaluate(async ({ webContents }, k: string) => {
    const chrome = webContents
      .getAllWebContents()
      .find((w) => !w.isDestroyed() && w.getURL().includes('renderer/index.html'));
    if (chrome === undefined) throw new Error('chrome window not found');
    chrome.focus();
    const press = (type: 'keyDown' | 'keyUp', keyCode: string, modifiers: 'control'[]) =>
      chrome.sendInputEvent({ type, keyCode, modifiers });
    press('keyDown', 'Control', ['control']);
    press('keyDown', k, ['control']);
    press('keyUp', k, ['control']);
    press('keyUp', 'Control', []);
  }, key);
}
