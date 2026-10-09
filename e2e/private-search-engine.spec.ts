import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * "Search engine in private windows", end to end: the same words typed into an ordinary window and a
 * private one must reach DIFFERENT engines.
 *
 * Two custom engines point at two paths on a local server, so which one a search landed on is read
 * straight off the request line. The ordinary window uses engine A; the private window is configured for
 * engine B. If the private flag were not threaded through to the search URL, both would hit A.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('a private window searches with its own engine, an ordinary one with the default', async () => {
  test.setTimeout(150_000);

  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>results</title><body>results</body>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.private-search-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'preferences.json'),
    JSON.stringify({
      customSearchEngines: [
        { id: 'custom-a', name: 'Engine A', searchUrlTemplate: `${base}/engine-a?q={q}` },
        { id: 'custom-b', name: 'Engine B', searchUrlTemplate: `${base}/engine-b?q={q}` },
      ],
      searchEngineId: 'custom-a',
      privateSearchEngineId: 'custom-b',
    }),
  );

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const ordinary = await app.firstWindow();
    const ordinaryBox = ordinary.getByRole('combobox').first();
    await expect(ordinaryBox).toBeVisible();

    await ordinaryBox.fill('ordinary words');
    await ordinaryBox.press('Enter');
    await expect.poll(() => hits.some((h) => h.startsWith('/engine-a?q=ordinary'))).toBe(true);

    await ordinary.evaluate(async () => {
      await (
        window as unknown as { tepegoz: { openPrivateWindow(): Promise<void> } }
      ).tepegoz.openPrivateWindow();
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
    const privateBox = (priv as Awaited<ReturnType<typeof app.firstWindow>>)
      .getByRole('combobox')
      .first();
    await expect(privateBox).toBeVisible();

    await privateBox.fill('private words');
    await privateBox.press('Enter');
    await expect.poll(() => hits.some((h) => h.startsWith('/engine-b?q=private'))).toBe(true);

    // The two never crossed: the private words did not reach A, the ordinary words did not reach B.
    expect(hits.some((h) => h.startsWith('/engine-a?q=private'))).toBe(false);
    expect(hits.some((h) => h.startsWith('/engine-b?q=ordinary'))).toBe(false);
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
