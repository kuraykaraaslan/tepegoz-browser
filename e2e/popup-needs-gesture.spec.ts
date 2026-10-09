import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * The popup blocker, end to end: `window.open` from a page that was never interacted with opens nothing,
 * while the same call from a real click does. The unit suite pins the handler's branches against fakes;
 * this runs it inside Electron, where the gesture signal is a genuine input event.
 *
 * The control matters as much as the block: without it, "no popup tab appeared" could just mean
 * `window.open` never ran or tabs never open from pages. The page therefore reports back (`/ran`) once
 * its on-load attempt has executed, and the click that follows must open its target.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

const html = (title: string, body = ''): string =>
  `<!doctype html><title>${title}</title><body style="margin:0">${body}`;

test('window.open needs a user gesture: a scripted popup is blocked, a clicked one opens', async () => {
  test.setTimeout(150_000);

  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    switch (req.url) {
      case '/auto':
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(html('AutoPopup'));
        return;
      case '/clicked':
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(html('ClickedPopup'));
        return;
      case '/':
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(
          html(
            'PopSource',
            `<div onclick="window.open('/clicked')" style="width:200px;height:200px">click me</div>` +
              `<script>window.open('/auto');fetch('/ran')</script>`,
          ),
        );
        return;
      default:
        res.writeHead(204).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.popup-gesture-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    await box.fill(`${base}/`);
    await box.press('Enter');
    await expect(page.getByRole('tab', { name: /PopSource/ })).toHaveCount(1, { timeout: 30_000 });

    // The on-load attempt ran, and left no tab and no fetch of its target.
    await expect.poll(() => hits.includes('/ran'), { timeout: 30_000 }).toBe(true);
    await new Promise((r) => setTimeout(r, 2000));
    expect(hits).not.toContain('/auto');
    await expect(page.getByRole('tab', { name: /AutoPopup/ })).toHaveCount(0);

    // Control: a genuine press-and-release over the element opens its popup.
    await app.evaluate(async ({ webContents }, u: string) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL() === u);
      if (wc === undefined) throw new Error('source page not found');
      for (const type of ['mouseDown', 'mouseUp'] as const) {
        wc.sendInputEvent({ type, x: 50, y: 50, button: 'left', clickCount: 1 });
      }
    }, `${base}/`);
    await expect(page.getByRole('tab', { name: /ClickedPopup/ })).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.getByRole('tab', { name: /AutoPopup/ })).toHaveCount(0);
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
