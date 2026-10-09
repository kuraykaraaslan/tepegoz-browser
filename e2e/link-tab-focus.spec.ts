import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * "Switch to a new tab opened from a link", end to end.
 *
 * A `target=_blank` click is clicked INSIDE the page's own webContents (with a user gesture, so the popup
 * blocker lets it through), the way a person's click would arrive. With the setting on, the new tab takes
 * focus; with it off it opens behind the page being read.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

async function withLinkPage<T>(run: (base: string) => Promise<T>): Promise<T> {
  const server: Server = createServer((req, res) => {
    const target = (req.url ?? '').includes('target');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      target
        ? '<!doctype html><title>LinkTarget</title><body>target</body>'
        : '<!doctype html><title>LinkSource</title><body><a id="l" target="_blank" href="/target">go</a></body>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  try {
    return await run(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function clickLinkAndReadSelection(
  profileName: string,
  prefs: Record<string, unknown>,
  base: string,
): Promise<{ source: string | null; target: string | null }> {
  const profileDir = join(process.cwd(), profileName);
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), JSON.stringify(prefs));
  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    await box.fill(`${base}/`);
    await box.press('Enter');
    const source = page.getByRole('tab', { name: /LinkSource/ });
    await expect(source).toHaveCount(1);

    // Click the link inside the page itself, with a user gesture.
    await app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/'));
      if (wc === undefined) throw new Error('source page not found');
      // A real mouse press-and-release over the link (top-left of the page, past the 8px body margin):
      // the popup blocker keys on genuine input events, not on script-initiated clicks.
      for (const type of ['mouseDown', 'mouseUp'] as const) {
        wc.sendInputEvent({ type, x: 14, y: 14, button: 'left', clickCount: 1 });
      }
    });

    const target = page.getByRole('tab', { name: /LinkTarget/ });
    await expect(target).toHaveCount(1, { timeout: 30_000 });
    return {
      source: await source.getAttribute('aria-selected'),
      target: await target.getAttribute('aria-selected'),
    };
  } finally {
    await app.close().catch(() => undefined);
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
}

test('a link-opened tab takes focus by default, and opens behind the page when the setting is off', async () => {
  test.setTimeout(240_000);
  await withLinkPage(async (base) => {
    const on = await clickLinkAndReadSelection('.link-focus-on-profile', {}, base);
    expect(on).toEqual({ source: 'false', target: 'true' });

    const off = await clickLinkAndReadSelection(
      '.link-focus-off-profile',
      { switchToLinkTabs: false },
      base,
    );
    expect(off).toEqual({ source: 'true', target: 'false' });
  });
});
