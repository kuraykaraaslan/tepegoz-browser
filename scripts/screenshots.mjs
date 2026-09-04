/**
 * Screenshot driver for the built Tepegöz app.
 *
 * Launch mechanics copied from e2e/smoke.spec.ts, including its two documented
 * gotchas: hand Electron the app DIRECTORY (not out/main/index.js, which points
 * getAppPath() somewhere the extension catalog does not live), and strip
 * ELECTRON_RUN_AS_NODE from the env (some shells set it, which makes Electron
 * run headless as Node).
 *
 * Captures by COMPOSITING two `capturePage()` calls, and that shape is the
 * result of a measurement that overturned what this repo previously believed.
 *
 * Every tab — and, as of this build, every internal `tepegoz://` page — is an
 * isolated `WebContentsView` (ADR-0012) composited outside the host window's own
 * webContents. `BrowserWindow.capturePage()` captures that HOST webContents, so
 * it returns the chrome drawn and the page area blank. That much was already
 * known. What was also written down, and is wrong, is that nothing but a video
 * capture could see the page: the VIEW'S OWN `webContents.capturePage()` returns
 * it in full, at native resolution, for internal pages and ordinary web pages
 * alike. It was tested both ways before this script was changed.
 *
 * So a full product shot is the host capture (chrome, with a hole where the page
 * belongs) with the view capture composited into that hole at the view's own
 * bounds. Both halves are real pixels from the running app; nothing is drawn or
 * approximated, and the seam is exactly the rectangle Electron reports.
 *
 * An OS-level screen grab was tried to get the missing shot and REMOVED. It
 * captures whatever is physically in front on the desktop, and Windows refuses
 * foreground activation often enough that "front" is not the window you asked
 * for: it produced one capture of the operator's own browser with their tabs
 * and profile avatar, and another of a video playing on their screen. Do not
 * reintroduce it — the composite above is the deliberate capture that note
 * asked for, and it needs no access to the desktop at all.
 *
 * Real UI states only. Nothing here stages an agent run: the copy's standing
 * rule is that a mockup must not stand in for the real thing.
 */
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
//
// The reset spares `models/`, and that exception is load-bearing rather than
// tidy: `fetch-demo-model.mjs` puts a 1.1 GB .gguf there, and a blanket
// `rmSync(profileDir)` deletes it without saying so — the next capture run then
// re-downloads a gigabyte to reach the same state. This script did exactly that
// until it was caught, while `scripts/README.md` claimed both capture scripts
// already spared it. Wipe the entries, not the directory.
const profileDir = join('C:', 'Users', 'Public', 'tepegoz-demo');
const PROFILE_KEEP = new Set(['models']);
mkdirSync(profileDir, { recursive: true });
for (const entry of readdirSync(profileDir)) {
  if (PROFILE_KEEP.has(entry)) continue;
  rmSync(join(profileDir, entry), { recursive: true, force: true });
}
writeFileSync(join(profileDir, 'preferences.json'), '{}');

const app = await electron.launch({
  args: [`--user-data-dir=${profileDir}`, appDir],
  env: guiEnv(),
});

const win = await app.firstWindow();
await win.setViewportSize({ width: 1440, height: 900 });
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(2500);

/**
 * Capture the app.
 *
 *   'composite' (default) — chrome + page, the full product shot.
 *   'chrome'              — host webContents only. Correct for anything that
 *                           renders IN the chrome renderer (the command palette
 *                           is an overlay there, not a page).
 *   'page'                — the page alone, full-bleed, no browser furniture.
 *
 * The two halves come from two different webContents, so 'composite' overlays
 * the page onto the hole in the chrome at the view's own reported bounds. The
 * view image is scaled to those bounds rather than assumed to match them: the
 * capture comes back in device pixels and the bounds are in DIPs, so on any
 * display with a scale factor other than 1 they legitimately differ.
 */
async function shot(name, opts = {}) {
  const { mode = 'composite', waitMs = 1300 } = typeof opts === 'number' ? { waitMs: opts } : opts;
  await win.waitForTimeout(waitMs);

  const cap = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const host = await w.capturePage();
    const out = { host: host.toPNG().toString('base64'), view: null, bounds: null };
    // Children carrying a webContents are the page views; the last attached one
    // is the visible tab. A child with no webContents is a plain layout View.
    const views = w.contentView.children.filter((c) => c.webContents);
    const view = views[views.length - 1];
    if (view) {
      const img = await view.webContents.capturePage();
      if (!img.isEmpty()) {
        out.view = img.toPNG().toString('base64');
        out.bounds = view.getBounds();
      }
    }
    return out;
  });

  const file = join(OUT, `${name}.png`);
  const hostBuf = Buffer.from(cap.host, 'base64');

  if (mode === 'chrome' || !cap.view) {
    if (mode === 'composite' && !cap.view) console.log('  !', name, '— no page view captured; chrome only');
    writeFileSync(file, hostBuf);
    console.log('  ✓', name, mode === 'chrome' ? '(chrome)' : '(chrome only)');
    return;
  }

  const viewBuf = Buffer.from(cap.view, 'base64');
  if (mode === 'page') {
    writeFileSync(file, viewBuf);
    console.log('  ✓', name, '(page)');
    return;
  }

  const tmpHost = join(OUT, `.${name}.host.png`);
  const tmpView = join(OUT, `.${name}.view.png`);
  writeFileSync(tmpHost, hostBuf);
  writeFileSync(tmpView, viewBuf);
  const { x, y, width, height } = cap.bounds;
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', tmpHost, '-i', tmpView, '-filter_complex',
     `[1]scale=${width}:${height}[v];[0][v]overlay=${x}:${y}`, file],
    { encoding: 'utf8' },
  );
  rmSync(tmpHost, { force: true });
  rmSync(tmpView, { force: true });
  if (r.status !== 0) {
    // Never silently ship half a product shot: keep the chrome-only capture and say so.
    writeFileSync(file, hostBuf);
    console.log('  !', name, '— composite failed, wrote chrome only:', (r.stderr || '').trim().slice(0, 160));
    return;
  }
  console.log('  ✓', name, `(composite ${width}x${height} @ ${x},${y})`);
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
await shot('01-newtab', { waitMs: 600 });

// A real page, in the browser, with the chrome around it — the shot this script
// could not take until the capture target was corrected. Local, so it depends on
// nobody's uptime and carries nobody else's branding.
await go(pageUrl);
await shot('02-web-page');

// The command palette is an overlay in the CHROME renderer, not a page, so it is
// captured from the host webContents. Opened over an internal page: over a web
// page the composite would put a real page behind a floating panel, which reads
// as a screenshot of two things rather than one.
await go('tepegoz://extensions');
await win.keyboard.press('Control+K');
await shot('03-command-palette', { mode: 'chrome' });
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
  await shot(name, { waitMs: 1500 });
}

// Settings sub-pages that carry the product's actual argument.
//
// Addressed by URL fragment, not by clicking a label. The nav labels live in the
// settings page's OWN webContents, so `win.getByText(...)` — which talks to the
// chrome renderer — never finds them and every sub-page silently logged "not
// reachable". The shell keeps the active section in `location.hash`
// (settings-shared.tsx's CrossLink is an anchor to `#<section-id>`), so a plain
// navigation is both the honest user path and the one that works.
for (const [name, section] of [
  ['12-providers', 'providers'],
  ['13-agent-controls', 'agent-controls'],
  ['14-network-privacy', 'network-privacy'],
  ['15-privacy', 'privacy'],
]) {
  await go(`tepegoz://settings#${section}`);
  await shot(name, { waitMs: 1400 });
}

await app.close();
server.close();
console.log('done');
