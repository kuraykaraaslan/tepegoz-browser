import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Keyboard tab switching, end to end: Ctrl+Tab / Ctrl+Shift+Tab / Ctrl+PageUp / Ctrl+PageDown /
 * Ctrl+1…9, and the "most recently used first" order for Ctrl+Tab.
 *
 * Playwright's own `keyboard.press` never reaches Electron's `before-input-event` (see
 * `docs/known-issues.md`), but `webContents.sendInputEvent` from the main process does — it goes through
 * the same input pipeline a real key press does — so the keys are delivered that way, to the ACTIVE
 * page's contents, which is where a user's focus is when they press them.
 *
 * Four tabs: the initial New Tab, then pages One, Two and Three (Three active, being the last opened).
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

async function withFourTabs(
  profileName: string,
  prefs: Record<string, unknown>,
  run: (ctx: {
    selected: () => Promise<string>;
    press: (keyCode: string, modifiers?: string[]) => Promise<void>;
    release: (keyCode: string, modifiers?: string[]) => Promise<void>;
  }) => Promise<void>,
): Promise<void> {
  const server: Server = createServer((req, res) => {
    const n = (req.url ?? '/').replace(/\W/g, '') || 'root';
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>Tab ${n}</title><body>${n}</body>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
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
    await expect(page.getByRole('combobox').first()).toBeVisible();
    for (const n of ['one', 'two', 'three']) {
      await page.evaluate(
        (u: string) =>
          (window as unknown as { tepegoz: { createTab(u: string): void } }).tepegoz.createTab(u),
        `${base}/${n}`,
      );
      await expect(page.getByRole('tab', { name: new RegExp(`Tab ${n}`) })).toHaveCount(1);
    }
    const selected = async (): Promise<string> =>
      page.locator('[role=tab][aria-selected=true]').innerText();
    // Poll rather than sleep: the strip updates when main pushes the new state.
    const settle = async (): Promise<void> => {
      await new Promise((r) => setTimeout(r, 400));
    };
    const send =
      (type: 'keyDown' | 'keyUp') =>
      async (keyCode: string, modifiers: string[] = []) => {
        await app.evaluate(
          async ({ webContents }, args: { type: string; keyCode: string; modifiers: string[] }) => {
            // A held chord must stay on ONE page: Chromium drops a key-up whose key-down went to a different
            // widget, and the focused page changes as Tab switches tabs. So Ctrl-down picks the target
            // and the rest of the chord (until Ctrl-up) reuses it.
            const g = globalThis as unknown as { __chord?: Electron.WebContents };
            const wcs = webContents
              .getAllWebContents()
              .filter((w) => w.getURL().includes('127.0.0.1'));
            const pick = wcs.find((w) => !w.isDestroyed() && w.isFocused()) ?? wcs[wcs.length - 1];
            const held =
              g.__chord !== undefined && !g.__chord.isDestroyed() ? g.__chord : undefined;
            const target = held ?? pick;
            if (target === undefined) throw new Error('no page to receive the key');
            if (args.keyCode === 'Control' && args.type === 'keyDown') g.__chord = target;
            if (args.keyCode === 'Control' && args.type === 'keyUp') g.__chord = undefined;
            target.sendInputEvent({
              type: args.type as 'keyDown',
              keyCode: args.keyCode,
              modifiers: args.modifiers as ('control' | 'shift')[],
            });
          },
          { type, keyCode, modifiers },
        );
        await settle();
      };
    await run({ selected, press: send('keyDown'), release: send('keyUp') });
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
}

test('Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp/PageDown and Ctrl+1…9 move through the strip', async () => {
  test.setTimeout(150_000);
  await withFourTabs('.tabsw-positional-profile', {}, async ({ selected, press }) => {
    expect(await selected()).toMatch(/Tab three/);

    await press('Tab', ['control']); // forward from the last tab wraps to the first
    expect(await selected()).toMatch(/New Tab/);
    await press('Tab', ['control', 'shift']); // backward from the first wraps to the last
    expect(await selected()).toMatch(/Tab three/);

    await press('PageUp', ['control']);
    expect(await selected()).toMatch(/Tab two/);
    await press('PageDown', ['control']);
    expect(await selected()).toMatch(/Tab three/);

    await press('2', ['control']); // position 2 = page One
    expect(await selected()).toMatch(/Tab one/);
    await press('9', ['control']); // Ctrl+9 = the LAST tab, whatever the count
    expect(await selected()).toMatch(/Tab three/);
    await press('1', ['control']);
    expect(await selected()).toMatch(/New Tab/);

    await press('8', ['control']); // past the end: nothing happens
    expect(await selected()).toMatch(/New Tab/);
  });
});

test('with "most recently used first", one Ctrl+Tab goes back to the tab you came from; holding Ctrl goes deeper', async () => {
  test.setTimeout(150_000);
  await withFourTabs(
    '.tabsw-recent-profile',
    { tabSwitchOrder: 'recent' },
    async ({ selected, press, release }) => {
      // History, newest first: Three, Two, One, New Tab.
      expect(await selected()).toMatch(/Tab three/);

      // A real chord: Ctrl goes DOWN first (Chromium drops a key-up that has no matching key-down, so a
      // bare Ctrl release would be silently ignored), then Tab is pressed while it is held.
      await press('Control', ['control']);
      await press('Tab', ['control']);
      expect(await selected()).toMatch(/Tab two/); // positional order would have wrapped to New Tab
      await press('Tab', ['control']); // Ctrl still held: one step deeper
      expect(await selected()).toMatch(/Tab one/);
      // Ctrl released. Chromium usually DROPS this key-up (it follows a key-down the app handled), so the
      // walk really ends on the NEXT fresh Ctrl key-down below — which is the behaviour under test.
      await release('Control');

      await press('Control', ['control']);
      await press('Tab', ['control']); // a fresh walk from Tab one goes to the tab used before it: Three
      expect(await selected()).toMatch(/Tab three/);
      await release('Control');

      // PageUp/PageDown stay on the strip even in this mode.
      await press('PageUp', ['control']);
      expect(await selected()).toMatch(/Tab two/);
    },
  );
});
