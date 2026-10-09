import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * A page cannot start a download on its own. Scripted `<a download>.click()` calls with no user activation
 * produce no request at all — the origin never sees the file fetched, and nothing reaches the download
 * list — so a page cannot spray files at the user (they would be quarantined, ADR-0040, but still clutter
 * and consume bandwidth). The same call WITH user activation downloads normally: that control is what
 * makes the first half a measurement rather than a detector that could not see a download.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');
const CLICK_DOWNLOAD =
  '(()=>{const a=document.createElement("a");a.href="/file.bin";a.download="file.bin";document.body.appendChild(a);a.click();})();';

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Bridge {
  createTab(url: string): void;
  listDownloads(): Promise<{ filename: string }[]>;
}

test('a script-started download needs user activation; with it, the same call downloads', async () => {
  test.setTimeout(150_000);

  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html' });
      // Beacon so the test knows the script ran: a missing download is only meaningful if it did.
      res.end(`<script>fetch("/ran");${CLICK_DOWNLOAD}</script>`);
      return;
    }
    if (req.url === '/file.bin') {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="file.bin"',
      });
      res.end(Buffer.alloc(64, 0x42));
      return;
    }
    res.writeHead(204).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/page`;

  const profileDir = join(process.cwd(), '.download-gesture-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('combobox').first()).toBeVisible();
    await page.evaluate((u: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u);
    }, url);
    const list = () =>
      page.evaluate(() => (window as unknown as { tepegoz: Bridge }).tepegoz.listDownloads());

    // The page's script ran …
    await expect.poll(() => hits.includes('/ran'), { timeout: 30_000 }).toBe(true);
    await new Promise((r) => setTimeout(r, 2000));
    // … and its download attempt produced no fetch and no download record.
    expect(hits).not.toContain('/file.bin');
    expect(await list()).toEqual([]);

    // Control: with user activation (`executeJavaScript(…, true)`), the identical call downloads.
    await app.evaluate(
      async ({ webContents }, arg: { u: string; code: string }) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL() === arg.u);
        if (wc === undefined) throw new Error('page tab not found');
        await wc.executeJavaScript(arg.code, true);
      },
      { u: url, code: CLICK_DOWNLOAD },
    );
    await expect
      .poll(async () => (await list()).map((d) => d.filename), { timeout: 30_000 })
      .toEqual(['file.bin']);
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
