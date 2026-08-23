/**
 * Screenshot driver for the built Tepegöz app.
 *
 * Launch mechanics copied from e2e/smoke.spec.ts, including its two documented
 * gotchas: hand Electron the app DIRECTORY (not out/main/index.js, which points
 * getAppPath() somewhere the extension catalog does not live), and strip
 * ELECTRON_RUN_AS_NODE from the env (some shells set it, which makes Electron
 * run headless as Node).
 *
 * Captures with the main process's own `capturePage()`. Every tab is an
 * isolated `WebContentsView` (ADR-0012), composited outside the host window's
 * webContents, so a shot of a loaded WEB page comes back with the chrome drawn
 * and the page area blank. Internal `tepegoz://` pages render in the renderer
 * window and capture correctly, which is what this script sticks to.
 *
 * An OS-level screen grab was tried to get the missing shot and REMOVED. It
 * captures whatever is physically in front on the desktop, and Windows refuses
 * foreground activation often enough that "front" is not the window you asked
 * for: it produced one capture of the operator's own browser with their tabs
 * and profile avatar, and another of a video playing on their screen. Do not
 * reintroduce it. If a shot of a real page is needed, capture the tab's own
 * webContents and composite deliberately, or take it by hand.
 *
 * Real UI states only. Nothing here stages an agent run: the copy's standing
 * rule is that a mockup must not stand in for the real thing.
 */
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { _electron as electron } from '@playwright/test';

const OUT = process.argv[2] ?? '.shots';
mkdirSync(OUT, { recursive: true });
const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Tepegöz — local test page</title>
<style>
 body{margin:0;font:16px/1.65 "Segoe UI",system-ui,sans-serif;background:#fff;color:#0C2135}
 .wrap{max-width:780px;margin:0 auto;padding:56px 32px}
 h1{font-size:38px;letter-spacing:-.025em;margin:0 0 10px}
 h2{font-size:19px;margin:34px 0 10px}
 p{color:#4A5D70;max-width:62ch}
 .card{border:1px solid #E2E9F0;border-radius:12px;padding:20px 22px;margin-top:18px;background:#F7F9FB}
 code{font-family:Consolas,monospace;background:#E7EDF3;padding:2px 6px;border-radius:4px;font-size:.9em}
 input{padding:7px 11px;border:1px solid #CBD7E2;border-radius:7px;font:inherit;font-size:14px}
 button{padding:8px 15px;border:0;border-radius:7px;background:#07697A;color:#fff;font:inherit;font-size:14px}
 ul{color:#4A5D70} li{margin:5px 0}
</style></head><body><div class="wrap">
<h1>Local test page</h1>
<p>Served from <code>127.0.0.1</code> by the screenshot driver, so these captures depend on nobody
else's uptime and show nobody else's branding.</p>
<h2>Interactive elements</h2>
<div class="card">
  <label>Search <input placeholder="type here"></label>
  &nbsp;<button>Submit</button>
</div>
<h2>Structure the agent can perceive</h2>
<ul>
  <li>Headings, landmarks and labelled controls</li>
  <li>A form with a real submit target</li>
  <li>Links, lists and text content</li>
</ul>
</div></body></html>`;

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;

// Fresh profile each run: a carried-over one restores the previous run's tabs
// and the tab strip fills with leftovers from a session nobody is looking at.
//
// Under C:\Users\Public rather than the repo, because the app prints its profile
// path in the UI (the "wireproxy was not found, put it in ..." notice on the
// network settings page). A repo-relative path put the operator's username and
// a `.shot-profile` test artifact into a public marketing screenshot.
const profileDir = join('C:', 'Users', 'Public', 'tepegoz-demo');
rmSync(profileDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });
writeFileSync(join(profileDir, 'preferences.json'), '{}');

const app = await electron.launch({
  args: [`--user-data-dir=${profileDir}`, appDir],
  env: guiEnv(),
});

const win = await app.firstWindow();
await win.setViewportSize({ width: 1440, height: 900 });
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(2500);

/** Composite capture from the main process, so WebContentsView content is included. */
async function shot(name, waitMs = 1300) {
  await win.waitForTimeout(waitMs);
  const b64 = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const img = await w.capturePage();
    return img.toPNG().toString('base64');
  });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(b64, 'base64'));
  console.log('  ✓', name);
}

/** Dismiss the omnibox suggestion dropdown, which otherwise overlays the shot. */
async function dismiss() {
  await win.keyboard.press('Escape');
  await win.waitForTimeout(250);
  // Click a neutral spot in the chrome — the bookmarks bar strip — to blur the bar.
  await win.mouse.click(700, 98);
  await win.waitForTimeout(450);
}

/** Navigate via the real omnibox — the same path a user takes. */
async function go(url, waitMs = 2400) {
  const bar = win.getByRole('combobox').first();
  await bar.click();
  await win.keyboard.press('Control+A');
  await bar.fill(url);
  await win.keyboard.press('Enter');
  await win.waitForTimeout(waitMs);
  await dismiss();
}

console.log('capturing:');
await shot('01-newtab', 600);

// No shot of a loaded web page: tab content lives in a WebContentsView that
// neither Playwright's page screenshot nor BrowserWindow.capturePage() can
// reach, and the OS screen-grab that could was removed — see the header.
await go(pageUrl);

// Open the palette over an INTERNAL page. Over a web page the background is a
// WebContentsView, which capturePage() cannot reach — the palette then floats
// on a grey void, which looks like a broken build rather than a product shot.
await go('tepegoz://extensions');
await win.keyboard.press('Control+K');
await shot('03-command-palette');
await win.keyboard.press('Escape');
await win.waitForTimeout(500);

for (const [name, url] of [
  ['04-settings', 'tepegoz://settings'],
  ['05-extensions', 'tepegoz://extensions'],
  ['06-downloads', 'tepegoz://downloads'],
  ['07-uploads', 'tepegoz://uploads'],
  ['08-bookmarks', 'tepegoz://bookmarks'],
  ['09-history', 'tepegoz://history'],
  ['10-tasks', 'tepegoz://tasks'],
]) {
  await go(url);
  await shot(name, 1500);
}

// Settings sub-pages that carry the product's actual argument.
await go('tepegoz://settings');
for (const [name, label] of [
  ['12-providers', /Providers & API keys/i],
  ['13-agent-controls', /Agent controls/i],
  ['14-network-privacy', /Network privacy/i],
  ['15-privacy', /Privacy & telemetry/i],
]) {
  const item = win.getByText(label).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click();
    await shot(name, 1300);
  } else {
    console.log('  –', name, 'not reachable');
  }
}

await app.close();
server.close();
console.log('done');
