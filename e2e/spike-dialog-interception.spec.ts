import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * SPIKE (go/no-go, S3 PR4): can `webContents.debugger` own `Page.javascriptDialogOpening` /
 * `handleJavaScriptDialog`, and does an already-open native DevTools window on the same tab conflict with
 * it? The phase doc requires this run against a real Electron window — it cannot be answered from unit
 * tests, because both questions are about Chromium's real one-debugger-client-per-target limit, not about
 * code this repo controls.
 *
 * `CdpDriver.ensureAttached` (apps/desktop/src/main/agent/cdp-driver.electron.ts) already attaches the
 * debugger and calls `Page.enable` for every agent action, so Arm A below is the COMMON case during a
 * real run, not a hypothetical.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

function profile(name: string): string {
  const dir = join(process.cwd(), `.spike-${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'preferences.json'), '{}');
  return dir;
}

async function startPage(html: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const port = (server.address() as AddressInfo).port;
  return { server, origin: `http://127.0.0.1:${String(port)}` };
}

/** Navigate the app's active tab via the omnibox and wait for main-process webContents to show it. */
async function navigateAndWait(app: ElectronApplication, origin: string): Promise<void> {
  const window = await app.firstWindow();
  const omnibox = window.getByRole('combobox').first();
  await expect(omnibox).toBeVisible();
  await omnibox.fill(`${origin}/`);
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
    .toContain(origin);
}

test('SPIKE arm A: the debugger already attached for agent actions receives Page.javascriptDialogOpening, and CDP dismisses it — no page-principal override needed', async () => {
  const page = await startPage('<!doctype html><title>Dialog spike</title><body><p>ok</p></body>');
  const dir = profile('dialog-a');
  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  try {
    await navigateAndWait(app, page.origin);

    // Playwright's own Electron driver keeps a background CDP session on every renderer target and
    // auto-dismisses a dialog nothing has claimed — that would otherwise race OUR OWN
    // Page.handleJavaScriptDialog call. Registering our own context-level handler (Playwright's supported
    // API) tells Playwright's driver a handler exists, so ITS OWN internal auto-dismiss stands down.
    app.context().on('dialog', () => {
      // Deliberately empty: the real handling happens over raw webContents.debugger below, which is the
      // actual mechanism this spike exists to test.
    });

    // Everything in ONE evaluate call — attach, subscribe, trigger, await the event, dismiss — so there
    // is no cross-call gap for anything else to race the dialog in.
    const result = await app.evaluate(async ({ webContents }, needle: string) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(needle));
      if (wc === undefined) return { step: 'no-webcontents' };
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Page.enable');

      const opened = new Promise<{ message: string; type: string }>((resolve) => {
        wc.debugger.on('message', (_event, method, params) => {
          if (method === 'Page.javascriptDialogOpening') {
            resolve(params as { message: string; type: string });
          }
        });
      });

      const confirmResult = wc.executeJavaScript(
        "window.confirm('Delete ALL project files? This cannot be undone.')",
      );

      const dialog = await Promise.race([
        opened,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 4000),
        ),
      ]);
      if (dialog === null) {
        return { step: 'event-timeout', attached: wc.debugger.isAttached() };
      }

      let dismissError: string | null = null;
      try {
        await wc.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: false });
      } catch (err) {
        dismissError = String(err);
      }

      const confirmValue = await Promise.race([
        confirmResult,
        new Promise<string>((resolve) =>
          setTimeout(() => {
            resolve('confirm-still-pending');
          }, 3000),
        ),
      ]);

      return { step: 'done', dialog, dismissError, confirmValue };
    }, page.origin);

    console.log('[SPIKE arm A] result:', JSON.stringify(result));
    expect(result.step).toBe('done');
    expect(result.dialog?.type).toBe('confirm');
    expect(result.dialog?.message).toContain('Delete ALL project files');
    expect(result.dismissError).toBeNull();
    expect(result.confirmValue).toBe(false);
  } finally {
    await app.close();
    page.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SPIKE arm B: opening native DevTools on a tab BEFORE the agent debugger attaches — attach still succeeds (overturns the phase doc's own assumption)", async () => {
  const page = await startPage('<!doctype html><title>Dialog spike B</title><body>ok</body>');
  const dir = profile('dialog-b');
  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  try {
    await navigateAndWait(app, page.origin);
    const result = await app.evaluate(async ({ webContents }, needle: string) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(needle));
      if (wc === undefined) return 'no-webcontents';
      // Start from a clean slate — a real app injector (translate/typo/video-player) may already hold
      // the debugger on page load, and that would confound this specifically-about-DevTools question.
      if (wc.debugger.isAttached()) wc.debugger.detach();
      wc.openDevTools({ mode: 'detach' });
      await new Promise((r) => setTimeout(r, 1000));
      try {
        wc.debugger.attach('1.3');
        return 'attach-succeeded-with-devtools-open';
      } catch (err) {
        return `attach-failed: ${String(err)}`;
      }
    }, page.origin);
    // The measured answer — recorded in the phase doc from whatever this actually prints, not assumed.
    console.log('[SPIKE arm B] DevTools-open-first → attach result:', result);
    expect(result).toBe('attach-succeeded-with-devtools-open');
  } finally {
    await app.close();
    page.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SPIKE arm D: the full dialog flow (attach → Page.enable → confirm → dismiss) still works end-to-end with DevTools genuinely open the whole time', async () => {
  const page = await startPage('<!doctype html><title>Dialog spike D</title><body>ok</body>');
  const dir = profile('dialog-d');
  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  try {
    await navigateAndWait(app, page.origin);
    app.context().on('dialog', () => {
      // See arm A: stands Playwright's own competing auto-dismiss down.
    });
    const result = await app.evaluate(async ({ webContents }, needle: string) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(needle));
      if (wc === undefined) return { step: 'no-webcontents' };
      if (wc.debugger.isAttached()) wc.debugger.detach();
      wc.openDevTools({ mode: 'detach' });
      await new Promise((r) => setTimeout(r, 1000));
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Page.enable');

      const opened = new Promise<{ message: string; type: string }>((resolve) => {
        wc.debugger.on('message', (_event, method, params) => {
          if (method === 'Page.javascriptDialogOpening') {
            resolve(params as { message: string; type: string });
          }
        });
      });
      const confirmResult = wc.executeJavaScript("window.confirm('Delete ALL project files?')");
      const dialog = await Promise.race([
        opened,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 4000),
        ),
      ]);
      if (dialog === null) return { step: 'event-timeout' };
      await wc.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: false });
      const confirmValue = await Promise.race([
        confirmResult,
        new Promise<string>((resolve) =>
          setTimeout(() => {
            resolve('confirm-still-pending');
          }, 3000),
        ),
      ]);
      return { step: 'done', dialogType: dialog.type, confirmValue };
    }, page.origin);
    console.log('[SPIKE arm D] full flow with DevTools open:', JSON.stringify(result));
    expect(result).toEqual({ step: 'done', dialogType: 'confirm', confirmValue: false });
  } finally {
    await app.close();
    page.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SPIKE arm C: opening native DevTools on a tab AFTER the agent debugger is already attached (the realistic mid-run case)', async () => {
  const page = await startPage('<!doctype html><title>Dialog spike C</title><body>ok</body>');
  const dir = profile('dialog-c');
  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  try {
    await navigateAndWait(app, page.origin);
    const result = await app.evaluate(async ({ webContents }, needle: string) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(needle));
      if (wc === undefined) return 'no-webcontents';
      // Mirrors CdpDriver.ensureAttached's own guard: on a real page load one of the app's own
      // always-on page injectors (translate/typo/video-player) may already hold the debugger by the
      // time this runs, exactly like an agent action would find it.
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Page.enable');
      let detached = false;
      wc.debugger.once('detach', () => {
        detached = true;
      });
      let openDevToolsThrew: string | null = null;
      try {
        wc.openDevTools({ mode: 'detach' });
      } catch (err) {
        openDevToolsThrew = String(err);
      }
      await new Promise((r) => setTimeout(r, 1000));
      return {
        openDevToolsThrew,
        agentDebuggerDetachedByDevTools: detached,
        agentDebuggerStillAttached: wc.debugger.isAttached(),
      };
    }, page.origin);
    console.log(
      '[SPIKE arm C] agent-attached-first → open DevTools result:',
      JSON.stringify(result),
    );
    // The measured answer: opening DevTools once the agent already holds the debugger neither throws
    // nor silently kicks the agent's session — the dialog listener registered on it stays live.
    expect(result).toEqual({
      openDevToolsThrew: null,
      agentDebuggerDetachedByDevTools: false,
      agentDebuggerStillAttached: true,
    });
  } finally {
    await app.close();
    page.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
