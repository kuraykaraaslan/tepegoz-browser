import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

const electronPath = createRequire(import.meta.url)('electron') as string;

/**
 * SPIKE (make-or-break, isolated): proves the shared "keep rendering while not visible" foundation in
 * the SHIPPING app. Measures, in the MAIN process, both perception paths on a web tab that is NOT
 * visible:
 *   A. Feature 1 — a HIDDEN tab (attached but parked off-screen inside a visible window).
 *   B. Feature 2 — the ACTIVE tab of an off-screen-PARKED window (the close-to-tray mechanism).
 * For each: capturePage() non-empty ⟺ compositor still paints; document.elementFromPoint(center) returns
 * an element ⟺ the render-DOM perception buildDomTree relies on is NOT blinded. Fully isolated: a temp
 * --user-data-dir (seeded so onboarding is skipped) + a LOCAL http page (no external network).
 */

// Launch the app DIRECTORY (not out/main/index.js) so getAppPath() = apps/desktop and getAppPath()-
// relative resources (the extension catalog) resolve — same as the eval harness. The production
// keep-rendering switches are applied by the app itself now, so the harness need not pass them.
const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Bridge {
  getTabsState(): Promise<{ tabs: { id: string; url: string; hidden?: boolean }[]; activeId: string | null }>;
  createTab(url?: string): void;
  setTabHidden(id: string, hidden: boolean): void;
}
// NOTE: page.evaluate callbacks run in the BROWSER — they can't call a Node-side helper, so each inlines
// `(window as unknown as { tepegoz: Bridge }).tepegoz`. The type cast is compile-time only (erased).

interface ProbeResult {
  found: boolean;
  empty?: boolean;
  width?: number;
  height?: number;
  hit?: string | null;
}

/** In the MAIN process: capture + hit-test the WebContents whose URL contains `needle`. */
async function probe(app: ElectronApplication, needle: string): Promise<ProbeResult> {
  return pollEvaluate(() => app.evaluate(async ({ webContents }, urlNeedle: string): Promise<ProbeResult> => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(urlNeedle));
    if (wc === undefined) return { found: false };
    const img = await wc.capturePage();
    const dom = (await wc.executeJavaScript(
      '(() => { const el = document.elementFromPoint(Math.floor(window.innerWidth/2), Math.floor(window.innerHeight/2)); return { w: window.innerWidth, h: window.innerHeight, hit: el ? el.tagName : null }; })()',
    )) as { w: number; h: number; hit: string | null };
    return { found: true, empty: img.isEmpty(), width: dom.w, height: dom.h, hit: dom.hit };
  }, needle), { found: false });
}

test('parked hidden tab + tray window keep compositing AND stay perceivable', async () => {
  // A local page (no external network) with a full-viewport button, so elementFromPoint(center) === BUTTON.
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><html><body style="margin:0"><button id="b" style="width:100vw;height:100vh;font-size:48px">SPIKE</button></body></html>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const pageUrl = `http://127.0.0.1:${port}/`;

  // Isolated profile: a temp --user-data-dir with a preferences.json present but WITHOUT
  // `onboardingCompleted` → PreferenceStore treats it as already onboarded (see preference-store.ts).
  const profileDir = join(process.cwd(), `.spike-profile-${port}`);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('[role="tab"]').first()).toBeVisible();

    // Open the local web page in a tab and wait until it has actually laid out + painted once.
    await page.evaluate(
      (u: string) => (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u),
      pageUrl,
    );
    await expect
      .poll(async () => (await probe(app, `:${port}`)).hit, { timeout: 15000 })
      .toBe('BUTTON');

    // ── B. Feature 2: off-screen-PARKED (still shown) window keeps compositing the ACTIVE tab ──
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.getParentWindow() === null);
      win?.setSkipTaskbar(true);
      win?.setPosition(-32000, -32000); // hideToTray: shown but off every display
    });
    await expect.poll(async () => (await probe(app, `:${port}`)).empty, { timeout: 8000 }).toBe(false);
    const trayProbe = await probe(app, `:${port}`);
    expect(trayProbe.hit).toBe('BUTTON'); // tray-parked window → perception still works
    // Un-park before the next check.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.getParentWindow() === null);
      win?.setPosition(80, 80);
      win?.setSkipTaskbar(false);
    });

    // ── A. Feature 1: HIDE the web tab (parked off-screen inside a VISIBLE window) ──
    const spikeId = await page.evaluate(async (needle: string) => {
      const api = (window as unknown as { tepegoz: Bridge }).tepegoz;
      const st = await api.getTabsState();
      return st.tabs.find((t) => t.url.includes(needle))?.id ?? null;
    }, `:${port}`);
    expect(spikeId).not.toBeNull();
    // a 2nd (blank) tab so ≥1 stays visible after hiding
    await page.evaluate(() => (window as unknown as { tepegoz: Bridge }).tepegoz.createTab());
    await page.evaluate(
      (id: string) => (window as unknown as { tepegoz: Bridge }).tepegoz.setTabHidden(id, true),
      spikeId as string,
    );

    // It keeps compositing AND stays perceivable while hidden (parked off-screen).
    await expect.poll(async () => (await probe(app, `:${port}`)).empty, { timeout: 8000 }).toBe(false);
    const hiddenProbe = await probe(app, `:${port}`);
    expect(hiddenProbe.found).toBe(true);
    expect(hiddenProbe.empty).toBe(false); // screenshot path alive
    expect(hiddenProbe.hit).toBe('BUTTON'); // DOM path (elementFromPoint) alive → buildDomTree not blinded
    expect(hiddenProbe.width).toBeGreaterThan(0); // stable, non-zero viewport (no reflow-to-zero)
    expect(hiddenProbe.height).toBeGreaterThan(0);
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test('start-in-background launches PARKED (off-screen) but keeps rendering', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><html><body style="margin:0"><button id="b" style="width:100vw;height:100vh;font-size:48px">BG</button></body></html>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const pageUrl = `http://127.0.0.1:${port}/`;

  const profileDir = join(process.cwd(), `.spike-bg-${port}`);
  mkdirSync(profileDir, { recursive: true });
  // startupMode:'background' → launch parked in the tray. The file existing (no `onboardingCompleted`
  // key) also skips onboarding.
  writeFileSync(join(profileDir, 'preferences.json'), JSON.stringify({ startupMode: 'background' }));

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('[role="tab"]').first()).toBeVisible();

    // Launched PARKED: shown (compositor runs) but off every display (start-in-background).
    const winState = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.getParentWindow() === null);
      const pos = win?.getPosition() ?? [0, 0];
      return { x: pos[0], visible: win?.isVisible() ?? false };
    });
    expect(winState.visible).toBe(true); // shown → compositor active (not hidden)
    expect(winState.x).toBeLessThan(-10000); // off-screen → invisible to the user, i.e. "in the background"

    // A web tab opened while the app runs in the background still lays out + paints.
    await page.evaluate(
      (u: string) => (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u),
      pageUrl,
    );
    await expect.poll(async () => (await probe(app, `:${port}`)).hit, { timeout: 15000 }).toBe('BUTTON');
    const bg = await probe(app, `:${port}`);
    expect(bg.empty).toBe(false); // renders while the whole app is backgrounded
    expect(bg.hit).toBe('BUTTON');
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test('--background arg launches PARKED (off-screen), no pref needed', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><html><body style="margin:0"><button id="b" style="width:100vw;height:100vh;font-size:48px">ARG</button></body></html>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const pageUrl = `http://127.0.0.1:${port}/`;

  const profileDir = join(process.cwd(), `.spike-arg-${port}`);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}'); // NO startInBackground pref → tests the ARG

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir, '--background'],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('[role="tab"]').first()).toBeVisible();

    // reveal() parks on ready-to-show (or its 4s fallback) — poll until the window has settled off-screen.
    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(({ BrowserWindow }) => {
                const win = BrowserWindow.getAllWindows().find((w) => w.getParentWindow() === null);
                return win?.getPosition()?.[0] ?? 0;
              }),
            // 0 is "on screen", i.e. not-yet-parked — the correct "keep polling" answer here.
            0,
          ),
        { timeout: 8000 },
      )
      .toBeLessThan(-10000); // --background alone (no pref) parks off-screen

    // …and a web tab still renders in that backgrounded window.
    await page.evaluate(
      (u: string) => (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u),
      pageUrl,
    );
    await expect.poll(async () => (await probe(app, `:${port}`)).hit, { timeout: 15000 }).toBe('BUTTON');
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test('TEPEGOZ_START_BACKGROUND=1 env launches PARKED (the reliable pnpm-dev trigger)', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><html><body style="margin:0"><button id="b" style="width:100vw;height:100vh;font-size:48px">ENV</button></body></html>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const pageUrl = `http://127.0.0.1:${port}/`;

  const profileDir = join(process.cwd(), `.spike-env-${port}`);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}'); // no pref → tests the ENV var

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: { ...guiEnv(), TEPEGOZ_START_BACKGROUND: '1' },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('[role="tab"]').first()).toBeVisible();
    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(({ BrowserWindow }) => {
                const win = BrowserWindow.getAllWindows().find((w) => w.getParentWindow() === null);
                return win?.getPosition()?.[0] ?? 0;
              }),
            // 0 is "on screen", i.e. not-yet-parked — the correct "keep polling" answer here.
            0,
          ),
        { timeout: 8000 },
      )
      .toBeLessThan(-10000); // env var alone parks off-screen
    await page.evaluate(
      (u: string) => (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u),
      pageUrl,
    );
    await expect.poll(async () => (await probe(app, `:${port}`)).hit, { timeout: 15000 }).toBe('BUTTON');
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test('kiosk mode: fullscreen + chromeless, locked to the kiosk URL, still rendering', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><html><body style="margin:0"><button id="b" style="width:100vw;height:100vh;font-size:48px">KIOSK</button></body></html>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const kioskUrl = `http://127.0.0.1:${port}/`;

  const profileDir = join(process.cwd(), `.spike-kiosk-${port}`);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), JSON.stringify({ startupMode: 'kiosk', kioskUrl }));

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    // The window is a locked kiosk (fullscreen).
    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(({ BrowserWindow }) => {
                const win = BrowserWindow.getAllWindows().find((w) => w.getParentWindow() === null);
                return win?.isKiosk() ?? false;
              }),
            false,
          ),
        { timeout: 8000 },
      )
      .toBe(true);
    // Chromeless: the renderer shows NO tab strip.
    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    // The kiosk URL's web view fills the screen and renders.
    await expect.poll(async () => (await probe(app, `:${port}`)).hit, { timeout: 15000 }).toBe('BUTTON');
  } finally {
    await app.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test('close-to-tray: closing the last tab keeps the app alive; reopening gives a FOREGROUND window', async () => {
  const profileDir = join(process.cwd(), '.spike-lasttab');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  // closeToTray defaults true; startupMode defaults 'window'; onboarding skipped.
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[role="tab"]').first().waitFor();
    // Close every tab — the last close tears the window down (its page context dies with it).
    await page
      .evaluate(async () => {
        const api = (
          window as unknown as {
            tepegoz: { getTabsState(): Promise<{ tabs: { id: string }[] }>; closeTab(id: string): void };
          }
        ).tepegoz;
        const st = await api.getTabsState();
        for (const t of st.tabs) api.closeTab(t.id);
      })
      .catch(() => {
        /* the last close destroys the window → evaluate may reject; expected */
      });
    await new Promise((r) => setTimeout(r, 1500));

    // The app is STILL ALIVE (did NOT quit) with no chrome window — app.evaluate only resolves if alive.
    const chromeCount = await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().filter((w) => w.getParentWindow() === null).length,
    );
    expect(chromeCount).toBe(0);

    // Reopen via a 2nd instance (single-instance lock → second-instance → openWindow foreground).
    const p2 = spawn(electronPath, [`--user-data-dir=${profileDir}`, appDir], { env: guiEnv() });
    await new Promise((r) => setTimeout(r, 3500));
    p2.kill();

    const after = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.getParentWindow() === null);
      return { has: win !== undefined, x: win?.getPosition()?.[0] ?? null, visible: win?.isVisible() ?? false };
    });
    expect(after.has).toBe(true); // a fresh window opened
    expect(after.visible).toBe(true);
    expect(after.x ?? -99999).toBeGreaterThanOrEqual(0); // FOREGROUND (on-screen), not parked in background
  } finally {
    await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
