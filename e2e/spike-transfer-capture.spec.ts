import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/**
 * GO/NO-GO SPIKE: what does the Download Manager actually MISS?
 *
 * Phase 2c has a row called "transfer capture beyond the page — catch downloads the page did not
 * initiate through a normal navigation (media elements, `blob:`/redirect chains) so the manager is not
 * blind to a class of transfers". Before building anything for it, the honest question is which of
 * those the manager is blind to today, because the answer decides whether the row is a feature or a
 * paragraph.
 *
 * Three cases, each a real page doing a real thing:
 *
 *  1. `<a download href="blob:…">` clicked by the page — the common "generate a file client-side"
 *     pattern (CSV exports, canvas saves).
 *  2. A redirect chain ending in `Content-Disposition: attachment`.
 *  3. `webContents.downloadURL(blobUrl)` from MAIN — which is exactly what the "Save video as" context
 *     menu item does, and a blob URL belongs to the renderer that made it.
 *
 * Prints what happened rather than asserting it: the product of a spike is a decision.
 */
const PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>capture</title></head>
<body>
<a id="blob-link" download="generated.txt">download</a>
<a id="redirect-link" href="/redirect" download>redirect</a>
<script>
  const blob = new Blob(['tepegoz blob payload'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  document.getElementById('blob-link').href = url;
  window.__blobUrl = url;
</script>
</body></html>`;

test('SPIKE: which transfers does the Download Manager not see', async () => {
  const server: Server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/final.bin' });
      res.end();
      return;
    }
    if (req.url === '/final.bin') {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="after-redirect.bin"',
      });
      res.end('redirected payload');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.capture-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    const omnibox = window.getByRole('combobox').first();
    await expect(omnibox).toBeVisible();
    await omnibox.fill(`${base}/page.html`);
    await omnibox.press('Enter');

    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(({ webContents }) =>
                webContents
                  .getAllWebContents()
                  .map((w) => w.getURL())
                  .join(' '),
              ),
            '',
          ),
        { timeout: 20_000 },
      )
      .toContain('/page.html');

    /** Ask main how many `will-download` events the browsing session has seen so far. */
    const armCounter = async (): Promise<void> => {
      await app.evaluate(({ session }) => {
        const globals = globalThis as unknown as { __captured?: string[] };
        globals.__captured = [];
        // Count on EVERY browsing session the app has, the way the real handler is registered.
        for (const partition of ['persist:tepegoz-web']) {
          session.fromPartition(partition).on('will-download', (_e, item) => {
            globals.__captured?.push(item.getURL().slice(0, 40));
          });
        }
      });
    };
    await armCounter();

    const captured = async (): Promise<string[]> =>
      app.evaluate(() => (globalThis as unknown as { __captured?: string[] }).__captured ?? []);

    // 1. The page clicks its own blob: anchor.
    await app.evaluate(async ({ webContents }) => {
      const tab = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/page.html'));
      await tab?.executeJavaScript('document.getElementById("blob-link").click()', true);
    });
    await new Promise((r) => setTimeout(r, 1_500));
    const afterBlobClick = await captured();

    // 2. The page follows a redirect chain into a Content-Disposition attachment.
    await app.evaluate(async ({ webContents }) => {
      const tab = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/page.html'));
      await tab?.executeJavaScript('document.getElementById("redirect-link").click()', true);
    });
    await new Promise((r) => setTimeout(r, 2_000));
    const afterRedirect = await captured();

    // 3. Main calls downloadURL with the renderer's blob URL — the "Save video as" path.
    const mainBlobResult = await app.evaluate(async ({ webContents }) => {
      const tab = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/page.html'));
      if (tab === undefined) return 'no tab';
      const blobUrl = (await tab.executeJavaScript('window.__blobUrl', true)) as string;
      try {
        tab.downloadURL(blobUrl);
        return `called with ${blobUrl.slice(0, 20)}…`;
      } catch (err) {
        return `threw: ${String(err).slice(0, 120)}`;
      }
    });
    await new Promise((r) => setTimeout(r, 1_500));
    const afterMainBlob = await captured();

    console.log(
      'TRANSFER CAPTURE SPIKE:',
      JSON.stringify(
        {
          afterBlobClick,
          afterRedirect,
          mainBlobResult,
          afterMainBlob,
        },
        null,
        2,
      ),
    );
    expect(afterMainBlob).toBeTruthy();
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
