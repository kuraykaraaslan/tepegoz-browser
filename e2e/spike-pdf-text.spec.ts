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
 * GO/NO-GO SPIKE: can the agent read the text of a PDF that is already open in the built-in viewer?
 *
 * Phase 2c's `browser_read_pdf` note asserts it can — "reuse its text layer, no new PDF library". That
 * assertion has never been measured, and it is the kind that is easy to believe: the viewer plainly
 * has the text (Ctrl+F finds it), so it feels like it must be reachable. But Chromium renders PDF text
 * through PDFium into a plugin frame, and "the viewer can find it" and "a `executeJavaScript` in the
 * tab can read it" are different claims.
 *
 * This spike answers it with numbers rather than an argument, by trying every route that would not
 * require a new PDF stack, and printing what each one returned. Written as a spike (like
 * `spike-code-exec-sandbox`) because its output is a DECISION, not a regression fence.
 */
const PROBE_TEXT = 'TEPEGOZ PDF PROBE 4711';

/** A single-page PDF that actually draws `PROBE_TEXT`. PDFium reconstructs the xref, so the table is
 *  deliberately omitted rather than hand-computed wrong. */
function probePdf(): string {
  const stream = `BT /F1 24 Tf 40 150 Td (${PROBE_TEXT}) Tj ET`;
  return [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]' +
      '/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj',
    `4 0 obj<</Length ${String(stream.length)}>>stream`,
    stream,
    'endstream endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    'trailer<</Size 6/Root 1 0 R>>',
    '%%EOF',
    '',
  ].join('\n');
}

test('SPIKE: which route, if any, reads text out of the built-in PDF viewer', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/pdf' });
    res.end(probePdf());
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const pdfUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/probe.pdf`;

  const profileDir = join(process.cwd(), '.pdf-text-profile');
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
      .toContain('/probe.pdf');

    // Give PDFium a moment to lay the page out; a route that would work is not proven not to by
    // being asked too early.
    await new Promise((r) => setTimeout(r, 2_000));

    const findings = await app.evaluate(async ({ webContents }, probe: string) => {
      const tab = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/probe.pdf'));
      if (tab === undefined) return { error: 'no tab on the pdf url' };
      const out: Record<string, unknown> = {};

      // Route A — the obvious one: the tab document's own text.
      try {
        const text = (await tab.executeJavaScript('document.body.innerText', true)) as string;
        out.mainWorldInnerText = { length: text.length, hasProbe: text.includes(probe) };
      } catch (err) {
        out.mainWorldInnerText = { error: String(err) };
      }

      // Route B — every frame in the subtree, which is where the viewer's own document lives.
      try {
        const frames = tab.mainFrame.framesInSubtree;
        const perFrame: unknown[] = [];
        for (const frame of frames) {
          try {
            const text = (await frame.executeJavaScript('document.body.innerText', true)) as string;
            perFrame.push({ url: frame.url.slice(0, 60), length: text.length, hasProbe: text.includes(probe) });
          } catch (err) {
            perFrame.push({ url: frame.url.slice(0, 60), error: String(err).slice(0, 80) });
          }
        }
        out.frames = perFrame;
      } catch (err) {
        out.frames = { error: String(err) };
      }

      // Route C — the accessibility tree over CDP. This is how a screen reader gets PDF text, so it is
      // the route with the best prior.
      try {
        // The app's own CdpDriver may already hold this target; a spike may take it, a tool may not.
        if (tab.debugger.isAttached()) tab.debugger.detach();
        tab.debugger.attach('1.3');
        await tab.debugger.sendCommand('Accessibility.enable');
        const tree = (await tab.debugger.sendCommand('Accessibility.getFullAXTree', {})) as {
          nodes?: { name?: { value?: string } }[];
        };
        const names = (tree.nodes ?? [])
          .map((n) => n.name?.value ?? '')
          .filter((v) => v.length > 0);
        out.axTree = {
          nodeCount: tree.nodes?.length ?? 0,
          hasProbe: names.some((n) => n.includes(probe)),
          sample: names.slice(0, 12),
        };
        tab.debugger.detach();
      } catch (err) {
        out.axTree = { error: String(err).slice(0, 200) };
        try {
          tab.debugger.detach();
        } catch {
          /* already detached */
        }
      }

      return out;
    }, PROBE_TEXT);

    // The spike's product is this line. It is printed, not asserted, because the answer decides a
    // design and a failing assertion would hide half of it.
    console.log('PDF TEXT SPIKE RESULT:', JSON.stringify(findings, null, 2));
    expect(findings).toBeTruthy();
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
