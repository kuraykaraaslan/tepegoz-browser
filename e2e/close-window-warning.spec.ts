import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * "Warn before closing a window with several tabs", end to end.
 *
 * The decision logic and the close handler are unit-tested against doubles. What only a real window
 * shows is the handshake with Electron itself: that a `close` really is held back while the question is
 * up, that "Keep open" really leaves the window alive, and that confirming closes it exactly once without
 * asking a second time (`win.close()` re-enters the same handler synchronously).
 *
 * The native message box cannot be clicked from Playwright, so the main process's `dialog.showMessageBox`
 * is replaced with a scripted answer. The app looks it up at call time, so the swap is seen.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('closing a multi-tab window asks first; Keep open keeps it, Close tabs closes it once', async () => {
  test.setTimeout(150_000);

  const profileDir = join(process.cwd(), '.close-warning-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  // Close-to-tray off (it would merely hide the window and never ask), the warning on.
  writeFileSync(
    join(profileDir, 'preferences.json'),
    JSON.stringify({ confirmCloseMultiTab: true, closeToTray: false }),
  );

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('combobox').first()).toBeVisible();

    // A second tab, so the window has two to lose.
    await page.evaluate(() => {
      (window as unknown as { tepegoz: { createTab(u?: string): void } }).tepegoz.createTab();
    });
    await expect(page.getByRole('tab')).toHaveCount(2);

    // Script the dialog: record every question, answer from a queue.
    await app.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { __asked: string[]; __answers: number[] };
      g.__asked = [];
      g.__answers = [1]; // first question: "Keep open"
      (dialog as unknown as { showMessageBox: unknown }).showMessageBox = (
        _win: unknown,
        opts: { detail?: string; message?: string },
      ) => {
        g.__asked.push(`${opts.message ?? ''} | ${opts.detail ?? ''}`);
        return Promise.resolve({ response: g.__answers.shift() ?? 1, checkboxChecked: false });
      };
    });
    const asked = (): Promise<string[]> =>
      app.evaluate(() => (globalThis as unknown as { __asked: string[] }).__asked);
    const windowCount = (): Promise<number> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

    // ── Keep open: the close is vetoed, the question names the tab count, the window survives ──
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await expect.poll(async () => (await asked()).length).toBe(1);
    expect((await asked())[0]).toMatch(/2/);
    await new Promise((r) => setTimeout(r, 750));
    expect(await windowCount()).toBe(1);
    await expect(page.getByRole('tab')).toHaveCount(2);

    // ── Close tabs: it closes. A second question would be answered "Keep open" (the queue is empty and
    //    the default is 1), so the window closing at all is the proof that it was asked only once. ──
    await app.evaluate(() => {
      (globalThis as unknown as { __answers: number[] }).__answers = [0];
    });
    const closed = app.waitForEvent('close', { timeout: 30_000 });
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
      .catch(
        () => undefined, // the app exits as the last window goes, taking the evaluate with it
      );
    await closed;
  } finally {
    await app.close().catch(() => undefined);
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
});
