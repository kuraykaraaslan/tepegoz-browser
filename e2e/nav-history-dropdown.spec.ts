import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * The back/forward button dropdown (right-click a nav button → that tab's history), against the REAL
 * app.
 *
 * What only a live run can settle: how Chromium's `navigationHistory` actually reports itself. The
 * dropdown model assumes entries are ordered oldest→newest with `getActiveIndex()` pointing into them,
 * and that a negative `goToOffset` walks BACK. Those are the assumptions the menu is built on, and a
 * unit test with a hand-written fake would only re-assert my own guess. The menu's own list-building is
 * unit-tested (`packages/navigation`, `nav-history-menu.electron.test.ts`); this file proves the
 * substrate underneath it, plus that the bridge method the toolbar calls is really exposed.
 *
 * The native menu itself is not popped here: `Menu.popup()` puts a real OS menu on screen, which is
 * exactly the kind of thing that turns a suite flaky for no added coverage.
 */
const appDir = resolve(process.cwd(), 'apps/desktop');

/** A clean env without ELECTRON_RUN_AS_NODE (some shells set it, which makes Electron run as Node). */
function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('a tab’s real navigation history reads back the way the dropdown model assumes', async () => {
  const server: Server = createServer((req, res) => {
    const n = (req.url ?? '/1').replace('/', '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      `<!doctype html><html><head><title>Hist Page ${n}</title></head><body>${n}</body></html>`,
    );
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.nav-history-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();

    // The toolbar's right-click handler calls this; if the preload slice did not ship it, the button
    // would silently do nothing in the real app while every unit test still passed.
    // Reached through `globalThis` rather than `window.tepegoz`: this file compiles with the node
    // types only (no DOM lib), and the bridge's own typing lives in the renderer's tsconfig.
    const bridge = await window.evaluate(
      () =>
        typeof (globalThis as unknown as { tepegoz?: Record<string, unknown> }).tepegoz
          ?.showNavHistoryMenu,
    );
    expect(bridge).toBe('function');

    // Build three entries in ONE tab: the first omnibox navigation opens a web tab (the new-tab page
    // is internal and has no view), the next two move that same tab.
    const omnibox = window.getByRole('combobox').first();
    for (const n of ['1', '2', '3']) {
      await omnibox.fill(`${origin}/${n}`);
      await omnibox.press('Enter');
      await expect
        .poll(() => pollEvaluate(() => readHistory(app, origin), null), { timeout: 20_000 })
        .toMatchObject({ current: `${origin}/${n}` });
    }

    // Oldest→newest, with the active index at the end. This is the ordering the dropdown slices.
    expect(await readHistory(app, origin)).toEqual({
      urls: [`${origin}/1`, `${origin}/2`, `${origin}/3`],
      activeIndex: 2,
      current: `${origin}/3`,
    });

    // A NEGATIVE offset walks back — the sign convention every "back" row in the menu carries.
    await app.evaluate(({ webContents }, o: string) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith(o));
      wc?.navigationHistory.goToOffset(-2);
    }, origin);
    await expect
      .poll(() => pollEvaluate(() => readHistory(app, origin), null), { timeout: 20_000 })
      .toMatchObject({ activeIndex: 0, current: `${origin}/1` });

    // Going back does not truncate: the forward side is now populated, which is what makes the forward
    // button's dropdown have anything to show.
    const after = await readHistory(app, origin);
    expect(after?.urls).toEqual([`${origin}/1`, `${origin}/2`, `${origin}/3`]);
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

/** The active web tab's history as main sees it. Asked in MAIN because a tab is a `WebContentsView`,
 *  which never shows up in `app.windows()`. */
async function readHistory(
  app: ElectronApplication,
  origin: string,
): Promise<{ urls: string[]; activeIndex: number; current: string } | null> {
  return app.evaluate(({ webContents }, o: string) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith(o));
    if (wc === undefined) return null;
    return {
      urls: wc.navigationHistory.getAllEntries().map((e) => e.url),
      activeIndex: wc.navigationHistory.getActiveIndex(),
      current: wc.getURL(),
    };
  }, origin);
}
