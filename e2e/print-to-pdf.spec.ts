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
 * "Save as PDF" and `browser_export_pdf`, at the layer a test can actually reach.
 *
 * Both features come down to one call — `webContents.printToPDF` on the tab's own contents — and
 * everything above it is a native save dialog (the user command) or a capability-registry handler (the
 * agent tool), neither of which Playwright can drive. So this pins the part that would silently break:
 * that this Electron build renders a real page to real PDF bytes.
 *
 * Not a formality. `printToPDF` REJECTS on contents that cannot be rendered, and the whole reason
 * `savePageAsPdf` exists next to the system print dialog is to report that failure instead of writing
 * nothing and saying nothing. A page-to-PDF path that quietly stopped working would look identical
 * from the outside to one nobody had used yet.
 */
const PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Print probe</title></head><body><h1>Tepegoz print probe</h1>
<p>${'Text that must survive being rendered to a PDF page. '.repeat(20)}</p></body></html>`;

test('a loaded page renders to real PDF bytes', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const pageUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/print.html`;

  const profileDir = join(process.cwd(), '.print-profile');
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
    await omnibox.fill(pageUrl);
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
      .toContain('/print.html');

    const result = await app.evaluate(async ({ webContents }) => {
      const tab = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/print.html'));
      if (tab === undefined) return { error: 'no tab on the page url' };
      const pdf = await tab.printToPDF({});
      return {
        // `%PDF-` is the file's own claim about itself, and the only one worth asserting: a stub that
        // returned an empty buffer would pass a length check alone.
        header: Buffer.from(pdf.subarray(0, 5)).toString('latin1'),
        bytes: pdf.byteLength,
      };
    });

    expect(result).toMatchObject({ header: '%PDF-' });
    // A one-page render of this much text is comfortably over a kilobyte; the floor is here so an
    // "empty page" regression cannot pass by producing a technically-valid but blank document.
    expect((result as { bytes: number }).bytes).toBeGreaterThan(1_000);
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
