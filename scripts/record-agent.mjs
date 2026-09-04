/**
 * Records the agent running a real task, as a WebM video.
 *
 * Why not a plain screenshot loop: tab content lives in a WebContentsView
 * (ADR-0012), composited outside the host window's own webContents, so neither
 * a Playwright page screenshot nor BrowserWindow.capturePage() can see the page
 * the agent is driving — which is the entire point of the recording.
 *
 * So the capture runs through Electron's own `desktopCapturer`, which hands
 * back a stream of ONE window identified by an id Electron itself enumerated.
 *
 * ── STANDING RULE: NEVER an OS-level screen grab ──────────────────────────
 * A whole-screen grab captures whatever is physically in front, and on Windows
 * foreground activation is not guaranteed, so "in front" is not the window you
 * asked for. It was tried here, it twice captured the OPERATOR'S OWN DESKTOP —
 * once their personal browser with their tabs and profile avatar, once a video
 * playing on their screen — and it was removed. Do not reintroduce it, in this
 * script or in `scripts/screenshots.mjs`. The `desktopCapturer` path below is
 * the safe form and the only permitted one: it resolves the target by the
 * window's own `getMediaSourceId()`, so there is no branch that can wander onto
 * the desktop. `useSystemPicker: false` keeps a human out of that decision too.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The model is the catalog's recommended on-device Qwen2.5 1.5B, pre-downloaded
 * into the demo profile by `scripts/fetch-demo-model.mjs`. No API key, no spend, and no page
 * content leaves the machine — which also means the recording can be re-made by
 * anyone without borrowing someone's credentials.
 *
 *   node scripts/fetch-demo-model.mjs      # once, ~1.1 GB
 *   node scripts/record-agent.mjs <out-dir>
 *
 * STATUS: the capture works — the WebM contains the composited window with the
 * driven page visible, which no other method here achieves. What does NOT work
 * is THIS HARNESS'S dispatch path, and only that one. The script drives the
 * command palette (Ctrl+K → `Do`), and the palette's Do mode has no commands to
 * dispatch: `apps/desktop/src/renderer/src/command-palette-host.tsx` ends its
 * source builder with
 *
 *     // Do / Make / Tasks are the agent's modes; they fill in as those surfaces
 *     // expose commands. Shown as empty rather than hidden, because a mode that
 *     // appears only sometimes is harder to learn than one that is visibly empty.
 *     return { chat, do: [], make: [], tasks: [] };
 *
 * — still true as of this writing. So the typed goal is matched against an empty
 * command list ("No matching command") and Enter starts nothing.
 *
 * Be precise about the scope of that: the PALETTE is the broken path, not agent
 * dispatch. The agent does start, from two paths that work today:
 *
 *   - the Agent Console sidebar — `extensions/ext-agent/src/panel-actions.ts`
 *     `onRun()` calls `api.runAgent({ prompt, groupId, … })`. This is how the
 *     existing `agent-demo.gif` on the marketing site was driven.
 *   - the omnibox — `apps/desktop/src/renderer/src/app-omnibox-history.ts`
 *     `startAgentRun()` ensures a group, opens its console, then calls
 *     `window.tepegoz.runAgent(…)`.
 *
 * Both land on the same preload bridge, `runAgent` in
 * `apps/desktop/src/preload/api-agent-models.ts`, over `IpcChannels.agentRun`.
 * Anyone re-pointing this harness should drive the sidebar (or call `runAgent`
 * through the bridge) rather than teach the palette a new trick here — adding a
 * dispatch path is a product change and belongs in the product, not in a
 * capture script.
 *
 * The publication ban stands REGARDLESS, and is not lifted by the above: as
 * written, this script records the app, not the agent, so its output must not be
 * published as a recording of the agent working. Re-point it at a real dispatch
 * path first, then re-read this line.
 */
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { _electron as electron } from '@playwright/test';

const OUT = process.argv[2] ?? '.recording';
mkdirSync(OUT, { recursive: true });

const MODEL_ID = 'qwen2.5-1.5b-instruct-q4';
const appDir = resolve(process.cwd(), 'apps/desktop');
const profileDir = join('C:', 'Users', 'Public', 'tepegoz-demo');

function guiEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

if (!existsSync(join(profileDir, 'models', `${MODEL_ID}.gguf`))) {
  console.error(`Model missing. Run: node scripts/fetch-demo-model.mjs`);
  process.exit(1);
}

/* A local page with a form the agent has an obvious, checkable job on. Local so
   the recording depends on nobody's uptime, shows nobody's branding, and does
   not automate a third party's site. */
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Contact — local demo</title>
<style>
 body{margin:0;font:16px/1.65 "Segoe UI",system-ui,sans-serif;background:#fff;color:#0C2135}
 .wrap{max-width:640px;margin:0 auto;padding:56px 32px}
 h1{font-size:34px;letter-spacing:-.02em;margin:0 0 8px}
 p{color:#4A5D70}
 label{display:block;margin:18px 0 6px;font-weight:600;font-size:14px}
 input,textarea{width:100%;padding:10px 12px;border:1px solid #CBD7E2;border-radius:8px;font:inherit;font-size:15px;box-sizing:border-box}
 button{margin-top:20px;padding:11px 20px;border:0;border-radius:8px;background:#07697A;color:#fff;font:inherit;font-size:15px;font-weight:600}
 #done{margin-top:20px;padding:14px 16px;border-radius:8px;background:#ECFAF3;color:#08492F;display:none}
</style></head><body><div class="wrap">
<h1>Contact</h1>
<p>A local page with a form, so the agent has something real and checkable to do.</p>
<form id="f">
  <label for="name">Name</label><input id="name" name="name">
  <label for="email">Email</label><input id="email" name="email" type="email">
  <label for="msg">Message</label><textarea id="msg" name="msg" rows="4"></textarea>
  <button type="submit">Send</button>
</form>
<div id="done">Thanks — your message was received.</div>
<script>
 document.getElementById('f').addEventListener('submit', (e) => {
   e.preventDefault();
   document.getElementById('f').style.display = 'none';
   document.getElementById('done').style.display = 'block';
 });
</script>
</div></body></html>`;

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;

/* Seed the profile: local provider on and pinned to the downloaded model, and
   `ask` autonomy left at its default so the recording shows the approval step
   rather than hiding it. Deleting everything except models/ keeps the download. */
rmSync(join(profileDir, 'preferences.json'), { force: true });
writeFileSync(
  join(profileDir, 'preferences.json'),
  JSON.stringify({
    defaultProvider: 'local',
    localProvider: { mode: 'default', selectedModelId: MODEL_ID },
    agentAutonomy: 'ask',
  }),
);

const app = await electron.launch({
  args: [`--user-data-dir=${profileDir}`, appDir],
  env: guiEnv(),
});
const win = await app.firstWindow();
await win.setViewportSize({ width: 1440, height: 900 });
await win.waitForTimeout(3000);

/**
 * Start recording the app's OWN window.
 *
 * The app hardens its session and denies media permission by default, so the
 * grant is installed for this run only, and it hands `getDisplayMedia` the
 * target BrowserWindow object itself rather than a picker. Electron resolves
 * that to exactly that window — there is no path here that can wander onto the
 * operator's desktop, which is the failure the removed screen-grab had.
 */
async function startRecording() {
  await app.evaluate(async ({ BrowserWindow, desktopCapturer }) => {
    const target = BrowserWindow.getAllWindows()[0];
    // The chrome window runs in its own partition, not defaultSession — installing
    // the grant anywhere else leaves security.ts's deny-by-default in force.
    const ses = target.webContents.session;
    ses.setDisplayMediaRequestHandler(
      (_request, callback) => {
        // Resolve to the source whose id is this window's own media-source id.
        // Matching on Electron's own identifier is what keeps the capture on the
        // app and off the operator's desktop.
        const wanted = target.getMediaSourceId();
        void desktopCapturer
          .getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
          .then((sources) => {
            const mine = sources.find((s) => s.id === wanted);
            callback(mine ? { video: mine } : { video: null });
          });
      },
      { useSystemPicker: false },
    );
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media' || permission === 'display-capture');
    });
    ses.setPermissionCheckHandler(
      (_wc, permission) => permission === 'media' || permission === 'display-capture',
    );
  });

  await win.evaluate(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.start(250);
    window.__rec = { rec, chunks, stream };
  });
}

async function stopRecording(file) {
  const b64 = await win.evaluate(
    () =>
      new Promise((done) => {
        const { rec, chunks, stream } = window.__rec;
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const buf = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer();
          let s = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          done(btoa(s));
        };
        rec.stop();
      }),
  );
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('wrote', file, (Buffer.from(b64, 'base64').length / 1e6).toFixed(2), 'MB');
}

const go = async (url) => {
  const bar = win.getByRole('combobox').first();
  await bar.click();
  await win.keyboard.press('Control+A');
  await bar.fill(url);
  await win.keyboard.press('Enter');
  await win.waitForTimeout(2400);
  await win.keyboard.press('Escape');
  await win.mouse.click(700, 98);
  await win.waitForTimeout(400);
};

await go(pageUrl);

console.log('recording…');
await startRecording();
await win.waitForTimeout(1200);

// Give the agent the task through the palette, as a user would — except that
// today this dispatches NOTHING (`do: []` in command-palette-host.tsx; see the
// STATUS block in the header). The keystrokes are left in place because they are
// the shape the recording should have once the palette gains Do commands; the
// working paths meanwhile are the Agent Console sidebar and `runAgent`.
await win.keyboard.press('Control+K');
await win.waitForTimeout(1000);
const doTab = win.getByText(/^Do$/).first();
if (await doTab.isVisible().catch(() => false)) await doTab.click();
await win.waitForTimeout(400);

const input = win.getByPlaceholder(/command|ask|Tepegöz/i).first();
await input.click();
await input.type(
  'Fill the contact form: name Ada Lovelace, email ada@example.com, message "Testing the agent." Then submit it.',
  { delay: 28 },
);
await win.waitForTimeout(600);
await win.keyboard.press('Enter');

// Let the run play out. The local 1.5B is slow; this is wall-clock, not a stub.
await win.waitForTimeout(90_000);

await stopRecording(join(OUT, 'agent-run.webm'));
await win.screenshot({ path: join(OUT, 'agent-final.png') });
console.log('final panel text:\n', (await win.locator('body').innerText()).slice(0, 1500));

await app.close();
server.close();
