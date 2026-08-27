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

/** A minimal but structurally complete single-page PDF. PDFium renders it; that is all this needs. */
const MINIMAL_PDF = [
  '%PDF-1.1',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Resources<<>>>>endobj',
  'trailer<</Size 4/Root 1 0 R>>',
  '%%EOF',
  '',
].join('\n');

/** Chromium's bundled PDF viewer extension id (stable across Chromium/Electron releases). Its
 *  `pdf_embedder.css` / `index.html` is injected into the tab document only when the built-in viewer
 *  handles the response — i.e. only when `webPreferences.plugins` is on for the browsed view
 *  (`browsedViewWebPreferences`). Without it the response would be routed to `will-download` instead. */
const PDF_VIEWER_EXTENSION_ID = 'mhjfbmdgcfjbbpaeojofohoefgiehjai';

/**
 * Built-in PDF viewer, end to end (Phase 2c): an `application/pdf` response opens IN THE TAB in
 * Chromium's viewer instead of downloading.
 */
test('an application/pdf URL renders in-tab in the built-in viewer, not as a download', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/pdf' });
    res.end(MINIMAL_PDF);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const pdfUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/doc.pdf`;

  const profileDir = join(process.cwd(), '.pdf-profile');
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
    await omnibox.fill(pdfUrl);
    await omnibox.press('Enter');

    // Wait for a webContents to actually be sitting on the PDF URL (navigation committed, not
    // intercepted into a download).
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
      .toContain('/doc.pdf');

    // The built-in viewer rewrites the tab document to host its embedder (a `pdf_embedder.css` link /
    // `index.html` under the extension origin). Assert that mount point exists — it is the difference
    // between "rendered in-tab" and "downloaded".
    const viewerMounted = await pollEvaluate(
      () =>
        app.evaluate(async ({ webContents }, extId: string) => {
          const tab = webContents
            .getAllWebContents()
            .find((w) => w.getURL().endsWith('/doc.pdf'));
          if (tab === undefined) return false;
          const html = (await tab.executeJavaScript(
            'document.documentElement.outerHTML',
          )) as string;
          return html.includes(extId);
        }, PDF_VIEWER_EXTENSION_ID),
      false,
    );
    expect(viewerMounted).toBe(true);
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
