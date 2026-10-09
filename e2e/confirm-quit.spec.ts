import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * "Confirm before quitting", end to end. With the setting on and two tabs open, Exit asks first: "Keep
 * running" leaves the app up, and only "Quit" ends the process. The native dialog is replaced by a
 * recorder so the test decides the answer and can see what was asked.
 *
 * Both quit paths are covered: Exit (the app's own) and a bare `app.quit()` (what an OS-level Cmd-Q becomes).
 *
 * The answers are given in that order on purpose: the "Keep running" half is what the setting is for, and
 * the "Quit" half is its control — without it, "the app is still running" could just mean Exit never works.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('Exit asks first when two tabs are open; "Keep running" stays up, "Quit" quits', async () => {
  test.setTimeout(150_000);

  const server: Server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>Tab ${req.url ?? ''}</title>tab`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.confirm-quit-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'preferences.json'),
    JSON.stringify({ confirmQuit: true, closeToTray: false, httpsFirstEverywhere: false }),
  );
  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  let exited = false;
  app.process().on('exit', () => {
    exited = true;
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    // Two real tabs: `createTab` opens a new one each time (typing in the address bar would navigate the
    // same tab, leaving a New Tab page and one site — still two tabs, but not the ones asserted on).
    for (const name of ['one', 'two']) {
      await page.evaluate((u: string) => {
        (window as unknown as { tepegoz: { createTab(url: string): void } }).tepegoz.createTab(u);
      }, `${base}/${name}`);
      await expect(page.getByRole('tab', { name: new RegExp(`Tab /${name}`) })).toHaveCount(1, {
        timeout: 30_000,
      });
    }

    // Record what the app asks, and answer. 1 = "Keep running", 0 = "Quit".
    await app.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { __asked: string[]; __answer: number };
      g.__asked = [];
      g.__answer = 1;
      dialog.showMessageBox = ((...args: unknown[]) => {
        const options = args.at(-1) as { message: string; detail: string };
        g.__asked.push(`${options.message} | ${options.detail}`);
        return Promise.resolve({ response: g.__answer, checkboxChecked: false });
      }) as never;
    });
    const asked = () =>
      app.evaluate(() => (globalThis as unknown as { __asked: string[] }).__asked);
    const exit = () =>
      page.evaluate(() => {
        (window as unknown as { tepegoz: { quitApp(): void } }).tepegoz.quitApp();
      });

    // "Keep running": the question was asked, and the app is still there.
    await exit();
    await expect.poll(async () => (await asked()).length, { timeout: 15_000 }).toBe(1);
    expect((await asked())[0]).toMatch(/Quit/);
    await new Promise((r) => setTimeout(r, 2000));
    expect(exited).toBe(false);
    await expect(page.getByRole('tab', { name: /Tab \/one/ })).toHaveCount(1);

    // A quit this app does not own (the OS menu's Cmd-Q arrives as a plain `app.quit()`) is caught by the
    // `before-quit` backstop: vetoed, asked about, and — on "Keep running" — dropped.
    await app.evaluate(({ app: electronApp }) => {
      electronApp.quit();
    });
    await expect.poll(async () => (await asked()).length, { timeout: 15_000 }).toBe(2);
    await new Promise((r) => setTimeout(r, 2000));
    expect(exited).toBe(false);

    // Control: answer "Quit" and the process really ends.
    await app.evaluate(() => {
      (globalThis as unknown as { __answer: number }).__answer = 0;
    });
    await exit();
    await expect.poll(() => exited, { timeout: 30_000 }).toBe(true);
  } finally {
    // `app.close()` is a quit like any other and would hit the very prompt under test; answer "Quit" so a
    // failed assertion above cannot turn into a hung teardown.
    await app
      .evaluate(() => {
        (globalThis as unknown as { __answer?: number }).__answer = 0;
      })
      .catch(() => undefined);
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
});
