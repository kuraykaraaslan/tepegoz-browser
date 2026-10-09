import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * A tab closed in a PRIVATE window must not appear in the shared "Recently closed" list.
 *
 * The list is process-wide (History menu, Ctrl+Shift+T), so before this was fixed a private window's page
 * title, URL and group name were readable from — and reopenable in — an ordinary window. A reviewer found
 * it by reading; this pins it against a real launch.
 *
 * The detector is sighted: the same steps in an ORDINARY window must put the page in the list, so an
 * empty list for the private one means something other than "the list is always empty".
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Bridge {
  openPrivateWindow(): Promise<void>;
  createTab(url?: string): void;
  listRecentlyClosedTabs(): Promise<{ title: string; url: string }[]>;
}

test('a tab closed in a private window never reaches the recently-closed list', async () => {
  test.setTimeout(150_000);

  const server: Server = createServer((req, res) => {
    const title = (req.url ?? '').includes('private') ? 'PrivateSecretPage' : 'OrdinaryVisiblePage';
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>${title}</title><body>${title}</body>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.private-closed-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const ordinary = await app.firstWindow();
    await expect(ordinary.getByRole('combobox').first()).toBeVisible();

    const closedTitles = (): Promise<string[]> =>
      ordinary.evaluate(async () => {
        const list = await (
          window as unknown as { tepegoz: Bridge }
        ).tepegoz.listRecentlyClosedTabs();
        return list.map((t) => `${t.title} ${t.url}`);
      });

    // ── Control: closing an ordinary tab DOES list it ──
    await ordinary.evaluate((u: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u);
    }, `${base}/ordinary`);
    const ordinaryTab = ordinary.getByRole('tab', { name: /OrdinaryVisiblePage/ });
    await expect(ordinaryTab).toHaveCount(1);
    await ordinaryTab.getByRole('button').last().click();
    await expect(ordinaryTab).toHaveCount(0);
    await expect
      .poll(async () => (await closedTitles()).join('|'))
      .toContain('OrdinaryVisiblePage');

    // ── A private window: open a page in a second tab, then close it ──
    await ordinary.evaluate(async () => {
      await (window as unknown as { tepegoz: Bridge }).tepegoz.openPrivateWindow();
    });
    let priv: Awaited<ReturnType<typeof app.firstWindow>> | null = null;
    await expect
      .poll(
        async () => {
          for (const page of app.windows()) {
            if ((await page.getByText('Private', { exact: true }).count()) > 0) {
              priv = page;
              return true;
            }
          }
          return false;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    if (priv === null) throw new Error('no private window');
    const privateWin = priv as Awaited<ReturnType<typeof app.firstWindow>>;

    await privateWin.evaluate((u: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u);
    }, `${base}/private`);
    const secretTab = privateWin.getByRole('tab', { name: /PrivateSecretPage/ });
    await expect(secretTab).toHaveCount(1, { timeout: 30_000 });
    await secretTab.getByRole('button').last().click();
    await expect(secretTab).toHaveCount(0);

    // Give the close time to be (wrongly) recorded, then read the list from BOTH windows.
    await new Promise((r) => setTimeout(r, 1500));
    const fromOrdinary = (await closedTitles()).join('|');
    expect(fromOrdinary).toContain('OrdinaryVisiblePage'); // the list is alive …
    expect(fromOrdinary).not.toContain('PrivateSecretPage'); // … and the private page is not in it
    expect(fromOrdinary).not.toContain('/private');
    const fromPrivate = await privateWin.evaluate(async () => {
      const list = await (
        window as unknown as { tepegoz: Bridge }
      ).tepegoz.listRecentlyClosedTabs();
      return list.map((t) => `${t.title} ${t.url}`).join('|');
    });
    expect(fromPrivate).not.toContain('PrivateSecretPage');
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
});
