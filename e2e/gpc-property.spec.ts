import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * `navigator.globalPrivacyControl` on top-level pages (ADR-0051), and — as important — what that one
 * browsed-page preload does NOT give a page.
 *
 *   setting on  → `true` in the top frame, before the page's first script runs;
 *   setting off → absent after the next load (the preload is unregistered, not merely ignored);
 *   always      → the page still has no `window.tepegoz`, `require` or `process`, so adding a preload to
 *                 browsed tabs did not hand them the bridge;
 *   the gap     → subframes and workers read `undefined`. Pinned as it is, so a future change to it is a
 *                 visible diff in this file rather than a silent behaviour change.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/** What the page reports about itself, as a JSON string in its title. */
const PAGE = `<!doctype html><title>pending</title>
<script>
  var r = {
    q: location.search,
    gpc: String(navigator.globalPrivacyControl),
    bridge: typeof window.tepegoz,
    require: typeof require,
    process: typeof process,
  };
  window.addEventListener('message', function (e) { r.sub = e.data; push(); });
  try {
    var w = new Worker(URL.createObjectURL(new Blob(['postMessage(String(navigator.globalPrivacyControl))'])));
    w.onmessage = function (e) { r.worker = e.data; push(); };
  } catch (err) { r.worker = 'error'; }
  function push() { document.title = 'R' + JSON.stringify(r); }
  push();
</script>
<iframe src="/sub"></iframe>`;
const SUB = `<script>parent.postMessage(String(navigator.globalPrivacyControl), '*')</script>`;

interface Report {
  q: string;
  gpc: string;
  bridge: string;
  require: string;
  process: string;
  sub?: string;
  worker?: string;
}

test('the page preload gives top-level pages the GPC property, follows the setting, and opens nothing else', async () => {
  test.setTimeout(150_000);

  const server: Server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url === '/sub' ? SUB : PAGE);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;

  const profileDir = join(process.cwd(), '.gpc-property-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'preferences.json'),
    JSON.stringify({ httpsFirstEverywhere: false }),
  );
  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();

    /** Load the page in a fresh navigation and return what it reported once subframe and worker spoke. */
    // Each load carries its own `?n=`, and a report only counts if it echoes it: the tab strip still shows
    // the PREVIOUS load's title until the new page's script runs, and reading that would be a stale answer.
    let loads = 0;
    const load = async (): Promise<Report> => {
      loads += 1;
      const q = `?n=${String(loads)}`;
      await box.fill(`${url}${q}`);
      await box.press('Enter');
      let report: Report | undefined;
      await expect
        .poll(
          async () => {
            const titles = await page.getByRole('tab').allInnerTexts();
            const t = titles.find((x) => x.startsWith('R{'));
            if (t === undefined) return false;
            const parsed = JSON.parse(t.slice(1)) as Report;
            if (parsed.q !== q || parsed.sub === undefined || parsed.worker === undefined) {
              return false;
            }
            report = parsed;
            return true;
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      return report!;
    };
    const setGpc = (on: boolean): Promise<unknown> =>
      page.evaluate(
        (v) =>
          (
            window as unknown as {
              tepegoz: { updatePreferences(p: Record<string, unknown>): Promise<unknown> };
            }
          ).tepegoz.updatePreferences({ globalPrivacyControl: v }),
        on,
      );

    // On (the default): the top frame sees it, the page has no way into the app, subframe/worker do not.
    const on = await load();
    expect(on.gpc).toBe('true');
    expect([on.bridge, on.require, on.process]).toEqual(['undefined', 'undefined', 'undefined']);
    expect([on.sub, on.worker]).toEqual(['undefined', 'undefined']); // the documented gap

    // Off, live: the next load of the same page no longer has it — and still nothing else leaked in.
    await setGpc(false);
    // A new tab-load is a new navigation, so the unregistered preload is gone for it.
    const off = await load();
    expect(off.gpc).toBe('undefined');
    expect([off.bridge, off.require, off.process]).toEqual(['undefined', 'undefined', 'undefined']);

    // And back on: re-registered, and the property returns.
    await setGpc(true);
    const again = await load();
    expect(again.gpc).toBe('true');
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
