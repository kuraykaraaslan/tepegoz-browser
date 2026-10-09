import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Per-site zoom (Phase 2c), end to end: zoom is remembered PER ORIGIN, survives a restart, does not leak
 * to other sites, and resetting a site to 100% leaves no record of it (the preference must not grow into
 * a list of everywhere the user has been).
 *
 * Two servers on different ports are two origins. The other-site check is paired with the zoomed one in
 * the same launch, so "B is 100%" cannot be an artefact of zoom simply not working.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

const serve = async (title: string): Promise<{ server: Server; origin: string }> => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>${title}</title>${title}`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return { server, origin: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}` };
};

test('zoom is remembered per origin across a restart, and reset leaves no record', async () => {
  test.setTimeout(180_000);
  const a = await serve('ZoomSiteA');
  const b = await serve('ZoomSiteB');

  const profileDir = join(process.cwd(), '.site-zoom-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const launch = (): Promise<ElectronApplication> =>
    electron.launch({ args: [`--user-data-dir=${profileDir}`, appDir], env: guiEnv() });

  try {
    let app = await launch();
    let page = await app.firstWindow();
    let box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();

    const zoom = (): Promise<number> =>
      page.evaluate(() =>
        (
          window as unknown as { tepegoz: { getPageZoom(): Promise<number> } }
        ).tepegoz.getPageZoom(),
      );
    const step = (direction: 'in' | 'out' | 'reset'): Promise<void> =>
      page.evaluate(
        (d) =>
          (window as unknown as { tepegoz: { setPageZoom(x: string): void } }).tepegoz.setPageZoom(
            d,
          ),
        direction,
      );
    const open = async (url: string, title: RegExp): Promise<void> => {
      await box.fill(`${url}/`);
      await box.press('Enter');
      await expect(page.getByRole('tab', { name: title, selected: true })).toHaveCount(1, {
        timeout: 30_000,
      });
    };

    // Site A: zoom in twice (100 → 110 → 125).
    await open(a.origin, /ZoomSiteA/);
    await step('in');
    await step('in');
    await expect.poll(zoom, { timeout: 10_000 }).toBe(125);

    // Site B, same launch: untouched at 100%.
    await open(b.origin, /ZoomSiteB/);
    await expect.poll(zoom, { timeout: 10_000 }).toBe(100);
    await app.close();

    // The stored record is exactly the one non-default origin.
    const stored = (
      JSON.parse(readFileSync(join(profileDir, 'preferences.json'), 'utf8')) as {
        siteZoomFactors?: Record<string, number>;
      }
    ).siteZoomFactors;
    expect(Object.keys(stored ?? {})).toEqual([a.origin]);

    // Restart: A comes back at 125%, B still 100%.
    app = await launch();
    page = await app.firstWindow();
    box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    await open(a.origin, /ZoomSiteA/);
    await expect.poll(zoom, { timeout: 10_000 }).toBe(125);
    await open(b.origin, /ZoomSiteB/);
    await expect.poll(zoom, { timeout: 10_000 }).toBe(100);

    // Reset A: back to 100% and no record left.
    await open(a.origin, /ZoomSiteA/);
    await step('reset');
    await expect.poll(zoom, { timeout: 10_000 }).toBe(100);
    await app.close();
    const after = (
      JSON.parse(readFileSync(join(profileDir, 'preferences.json'), 'utf8')) as {
        siteZoomFactors?: Record<string, number>;
      }
    ).siteZoomFactors;
    expect(Object.keys(after ?? {})).toEqual([]);
  } finally {
    await new Promise<void>((r) => a.server.close(() => r()));
    await new Promise<void>((r) => b.server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
});
