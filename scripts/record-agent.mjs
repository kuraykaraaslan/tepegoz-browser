/**
 * Records the agent running a real task, as a WebM video AND as a replayable
 * JSON trace of the same run.
 *
 * Two artefacts, one run, on purpose. The video shows what it looked like; the
 * trace is what the app actually decided, in the app's own event vocabulary. The
 * marketing site replays the trace in the DOM, so a visitor can scrub the run's
 * reasoning rather than watch pixels — and because both come out of the same
 * `runAgent` call, the two can never drift into describing different runs.
 *
 * ── Capture ─────────────────────────────────────────────────────────────────
 * Why not a screenshot loop: tab content lives in a WebContentsView (ADR-0012)
 * composited outside the host window's own webContents. (A STILL of that view is
 * reachable — see `screenshots.mjs`, which composites the view's own
 * `capturePage()` into the chrome — but a still is not a run.) Video comes from
 * Electron's `desktopCapturer`, resolved by the target window's own
 * `getMediaSourceId()`, which is the safe form of the OS screen grab that was
 * tried and removed: a whole-screen grab takes whatever is physically in front,
 * and on Windows foreground activation is not guaranteed, so it twice captured
 * the operator's own desktop. `desktopCapturer` has no branch that can wander.
 *
 * ── Dispatch ────────────────────────────────────────────────────────────────
 * The task goes in through the **Agent Console composer**, and that choice is
 * load-bearing rather than incidental.
 *
 * The console's transcript is built by `applyAgentEvent`
 * (`extensions/ext-agent/src/panel-state.ts`), which binds an event to a turn
 * whose `runId` matches — or, if the last turn's runId is still null, to that.
 * Only the composer's `onRun` (`panel-actions.ts`) creates such a turn BEFORE
 * calling `runAgent`. A run started any other way has nothing to bind to, so
 * every event is dropped as a straggler and the console renders an EMPTY
 * transcript for the whole run. The modals still appear — they are set on group
 * state unconditionally — so the failure looks like a design choice.
 *
 * That is also a real product defect and not merely a harness problem: typing
 * `@agent …` in the address bar opens a console that then shows nothing, and
 * `app-omnibox-history.ts`'s own comment says the console is opened precisely so
 * the user is not handed a task "to something invisible".
 *
 * The version before this one typed into the command palette's `Do` mode, where
 * `do: []` means there is nothing to dispatch. That harness recorded the app and
 * never the agent; the demo profile's journal from that session holds fourteen
 * events, every one of them `SessionSnapshotWritten`.
 *
 * ── Provider ────────────────────────────────────────────────────────────────
 * The key is installed through `window.tepegoz.addProviderKey(...)`, the same
 * bridge call the Providers settings page makes, so the credential takes the
 * product's own path into the OS keychain and never appears on screen. Typing it
 * into the visible settings form would have put a live key in a marketing video.
 * Set `TEPEGOZ_DEMO_PROVIDER=local` to run the on-device model instead, which
 * needs no key at all (`fetch-demo-model.mjs`).
 *
 * ── Honesty ─────────────────────────────────────────────────────────────────
 * Nothing here stages a result. The task is given once and the run is whatever
 * happens: if the agent fails, the recording is of a failure and the trace says
 * so. The one intervention is the approval gates — there is no human at this
 * keyboard, so the harness answers them by clicking the product's OWN buttons
 * after a readable pause, and every such click is recorded in the trace under
 * `answeredByHarness` so a page built on it cannot imply a person was watching.
 *
 *   node scripts/fetch-demo-model.mjs        # only for TEPEGOZ_DEMO_PROVIDER=local
 *   pnpm exec turbo run build --filter=@tepegoz/desktop
 *   node scripts/record-agent.mjs [out-dir]
 */
import { resolve, join } from 'node:path';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { _electron as electron } from '@playwright/test';

const OUT = process.argv[2] ?? '.recording';
mkdirSync(OUT, { recursive: true });

const appDir = resolve(process.cwd(), 'apps/desktop');
const profileDir = join('C:', 'Users', 'Public', 'tepegoz-demo');
const MODEL_ID = 'qwen2.5-1.5b-instruct-q4';

/** Provider for this capture. `local` needs no key; anything else needs one in .env.eval.local. */
const PROVIDER = process.env.TEPEGOZ_DEMO_PROVIDER ?? 'anthropic';

/**
 * The task. A real search on a real search engine, then a real third-party page.
 *
 * This is a deliberate exception to `scripts/README.md`'s local-page rule, taken
 * by the owner: a local form does not demonstrate what the recording exists to
 * demonstrate, which is an agent coping with markup nobody wrote for it. The
 * costs come with it — the capture depends on someone else's uptime and layout,
 * and is not byte-reproducible.
 */
const START_URL = 'https://duckduckgo.com/';
const TASK =
  process.env.TEPEGOZ_DEMO_TASK ??
  'Find the reddit thread about Electron app memory usage and tell me its title.';

/*
 * The task asks for ONE fact on purpose.
 *
 * The first version asked for the title *and* roughly how many comments. That
 * second clause cost about a minute: Reddit served a JS challenge screen, the
 * agent correctly refused to trust what it had read, and it spent four extra
 * tool calls re-reading and cross-checking a count that was never the point of
 * the demonstration. The behaviour was right and the recording was too long.
 *
 * Cutting the clause shortens the run without shortening the ARGUMENT: the
 * navigation still crosses an origin, so the kernel still stops to ask, and the
 * page is still one nobody wrote for an agent.
 */

/** Read a key out of .env.eval.local without printing it. */
function envKey(...names) {
  let text = '';
  try {
    text = readFileSync('.env.eval.local', 'utf8');
  } catch {
    return undefined;
  }
  for (const n of names) {
    const m = text.match(new RegExp(`^${n}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm'));
    if (m) return m[1];
  }
  return undefined;
}

// `ANTROPIC_API_KEY` is the spelling actually present in the env file; the
// correct one is accepted too so fixing the typo does not break this script.
const API_KEY =
  PROVIDER === 'anthropic'
    ? envKey('ANTHROPIC_API_KEY', 'ANTROPIC_API_KEY')
    : PROVIDER === 'openai'
      ? envKey('OPENAI_API_KEY')
      : undefined;

if (PROVIDER === 'local') {
  if (!existsSync(join(profileDir, 'models', `${MODEL_ID}.gguf`))) {
    console.error('Model missing. Run: node scripts/fetch-demo-model.mjs');
    process.exit(1);
  }
} else if (!API_KEY) {
  console.error(`No API key for provider "${PROVIDER}" in .env.eval.local.`);
  console.error('Set TEPEGOZ_DEMO_PROVIDER=local to record with the on-device model instead.');
  process.exit(1);
}

function guiEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/* Reset the demo profile, sparing `models/`: a blanket wipe silently deletes a
   1.1 GB download and the next run re-fetches it. */
const PROFILE_KEEP = new Set(['models']);
mkdirSync(profileDir, { recursive: true });
for (const entry of readdirSync(profileDir)) {
  if (PROFILE_KEEP.has(entry)) continue;
  rmSync(join(profileDir, entry), { recursive: true, force: true });
}
writeFileSync(
  join(profileDir, 'preferences.json'),
  JSON.stringify(
    PROVIDER === 'local'
      ? {
          defaultProvider: 'local',
          localProvider: { mode: 'default', selectedModelId: MODEL_ID },
          agentAutonomy: 'ask',
        }
      : { defaultProvider: PROVIDER, agentAutonomy: 'ask' },
  ),
);

const app = await electron.launch({ args: [`--user-data-dir=${profileDir}`, appDir], env: guiEnv() });
const win = await app.firstWindow();

/**
 * Size the real OS window, not just Playwright's viewport.
 *
 * `setViewportSize` resizes the renderer's view; `desktopCapturer` records the
 * WINDOW, so the first recording came out at the window's own 1280x854 and the
 * Agent Console — the panel the whole recording exists to show — was clipped at
 * the right edge. The console needs roughly 360px beside a usable page, and the
 * window has to stay inside the display, so the target is clamped to the work
 * area rather than assumed to fit.
 */
const framed = await app.evaluate(async ({ BrowserWindow, screen }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const area = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1680, area.width - 40);
  const height = Math.min(1000, area.height - 40);
  w.setBounds({ x: Math.max(0, Math.round((area.width - width) / 2)), y: 10, width, height });
  return { work: area, actual: w.getBounds() };
});
console.log('window:', JSON.stringify(framed.actual), 'work area:', JSON.stringify(framed.work));
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(3000);

/* Install the key through the product's own bridge — never through the visible form. */
if (PROVIDER !== 'local') {
  const ok = await win.evaluate(
    async ({ provider, key }) => {
      try {
        await window.tepegoz.addProviderKey(provider, 'Demo', key);
        return true;
      } catch {
        return false;
      }
    },
    { provider: PROVIDER, key: API_KEY },
  );
  console.log(ok ? `provider key installed (${PROVIDER})` : `WARNING: key install failed (${PROVIDER})`);
  await win.waitForTimeout(800);
}

/**
 * Record the run. Read-only: the UI answers the gates, not this.
 *
 * Everything the console is told is captured verbatim — the plan preview, every
 * `AgentEvent`, and every approval request. Answering through the bridge was
 * tried and removed: it left the panel's own state stale, so the plan modal
 * stayed on screen with its Run plan button for the rest of the run, because the
 * handler that clears it never fired.
 */
async function installCollector() {
  await win.evaluate(() => {
    const t = { startedAt: Date.now(), events: [], plans: [], approvals: [], terminal: null };
    window.__trace = t;

    window.tepegoz.onAgentEvent((e) => {
      t.events.push({ ...e, atMs: Date.now() - t.startedAt });
      if (e.kind === 'done' || e.kind === 'error') t.terminal = e.kind;
    });

    window.tepegoz.onAgentPlanPreview((p) => {
      t.plans.push({ ...p, atMs: Date.now() - t.startedAt });
    });

    window.tepegoz.onAgentApprovalRequest((r) => {
      t.approvals.push({
        atMs: Date.now() - t.startedAt,
        approvalId: r.approvalId,
        toolName: r.toolName,
        reason: r.reason,
        riskTier: r.riskTier ?? null,
        argsPreview: r.argsPreview,
      });
    });
  });
}

/** Navigate via the real omnibox — the path a user takes. */
async function go(url, waitMs = 3200) {
  const bar = win.getByRole('combobox').first();
  await bar.click();
  await win.keyboard.press('Control+A');
  await bar.fill(url);
  await win.keyboard.press('Enter');
  await win.waitForTimeout(waitMs);
  await win.keyboard.press('Escape');
  await win.mouse.click(700, 98);
  await win.waitForTimeout(400);
}

async function startRecording() {
  await app.evaluate(async ({ BrowserWindow, desktopCapturer }) => {
    const target = BrowserWindow.getAllWindows()[0];
    // The chrome window runs in its own partition, not defaultSession — installing
    // the grant anywhere else leaves security.ts's deny-by-default in force.
    const ses = target.webContents.session;
    ses.setDisplayMediaRequestHandler(
      (_request, callback) => {
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
    // Ask for 30fps and a bitrate that keeps small UI text legible. The first
    // capture ran at the default and landed at ~5fps, which reads as a slideshow
    // the moment the cursor moves.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 } },
      audio: false,
    });
    const chunks = [];
    const rec = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 6_000_000,
    });
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.start(250);
    // The trace and the video start at different moments; the site aligns them,
    // so the offset has to be recorded rather than estimated afterwards.
    window.__rec = { rec, chunks, stream, startedAt: Date.now() };
    if (window.__trace) window.__trace.recStartedAt = Date.now() - window.__trace.startedAt;
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
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(file, buf);

  /* MediaRecorder writes no duration into the container, so ffprobe reports
     `duration=N/A` and a <video> element cannot seek or show a scrubber. A
     stream copy through ffmpeg rewrites the header with the real duration and
     re-encodes nothing. */
  const remuxed = `${file}.remux.webm`;
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-c', 'copy', remuxed], {
    encoding: 'utf8',
  });
  if (r.status === 0) {
    renameSync(remuxed, file);
    console.log('wrote', file, (buf.length / 1e6).toFixed(2), 'MB (remuxed for duration)');
  } else {
    rmSync(remuxed, { force: true });
    console.log('wrote', file, (buf.length / 1e6).toFixed(2), 'MB — remux failed, no duration in container');
  }
}

await go(START_URL);
await installCollector();

console.log('recording…');
await startRecording();
await win.waitForTimeout(1400);

/* Open the console and hand the task to its composer — see the Dispatch note. */
await win.evaluate(async () => {
  const groupId = await window.tepegoz.ensureActiveGroup();
  window.tepegoz.updateTabGroup(groupId, { settings: { 'agent.panelOpen': true } });
});
await win.waitForTimeout(1800);

const composer = win.getByLabel('Tell Tepegöz what to do on this page…').first();
await composer.click();
await composer.type(TASK, { delay: 24 });
await win.waitForTimeout(900);
await win.getByLabel('Send', { exact: true }).first().click();

/* Wait for a terminal event rather than a fixed sleep, but cap it: a run that
   never terminates must still produce an artefact and say that it did not. */
const DEADLINE_MS = Number(process.env.TEPEGOZ_DEMO_TIMEOUT_MS ?? 300_000);
const startedWait = Date.now();
/** Every gate this harness answered, and when — the trace must not imply a human. */
const uiAnswers = [];
let terminal = null;

/* Answer the gates by clicking the product's own buttons, dwelling first: a gate
   that flashes past is a gate a viewer cannot read, and reading it is the point. */
const READ_DWELL_MS = Number(process.env.TEPEGOZ_DEMO_DWELL_MS ?? 2400);
async function answerIfVisible(name, kind) {
  const btn = win.getByRole('button', { name, exact: true }).first();
  if (!(await btn.isVisible().catch(() => false))) return;
  await win.waitForTimeout(READ_DWELL_MS);
  if (!(await btn.isVisible().catch(() => false))) return;
  await btn.click().catch(() => undefined);
  uiAnswers.push({ kind, button: name, atMs: Date.now() - startedWait, answeredBy: 'capture-harness' });
  console.log(`  answered ${kind} via "${name}" at ${((Date.now() - startedWait) / 1000).toFixed(1)}s`);
}

while (Date.now() - startedWait < DEADLINE_MS) {
  // The plan gate fail-safe REJECTS after 120s, so it is polled, not slept past.
  await answerIfVisible('Run plan', 'plan');
  await answerIfVisible('Approve', 'tool');
  terminal = await win.evaluate(() => window.__trace?.terminal ?? null);
  if (terminal) break;
  await win.waitForTimeout(700);
}
const elapsed = Date.now() - startedWait;
console.log(
  terminal
    ? `run finished: ${terminal} after ${(elapsed / 1000).toFixed(1)}s`
    : `run did NOT terminate within ${(DEADLINE_MS / 1000).toFixed(0)}s`,
);

/* Hold on the finished state. Long enough that the answer is readable, and long
   enough that the last MediaRecorder chunk is flushed into the file. */
await win.waitForTimeout(4500);
await stopRecording(join(OUT, 'agent-run.webm'));

const trace = await win.evaluate(() => window.__trace);
const payload = {
  traceVersion: 1,
  capturedBy: 'scripts/record-agent.mjs',
  provider: PROVIDER,
  autonomy: 'ask',
  startUrl: START_URL,
  task: TASK,
  terminal: terminal ?? 'timeout',
  durationMs: elapsed,
  /* ms from trace t0 to the first recorded frame — the site needs it to line the
     replay up with the video instead of guessing the offset. */
  recordingStartsAtMs: trace?.recStartedAt ?? null,
  plans: trace?.plans ?? [],
  events: trace?.events ?? [],
  approvals: trace?.approvals ?? [],
  /* Gates answered by this harness, by clicking the product's own buttons.
     There is no human at this keyboard and the trace must never imply one. */
  answeredByHarness: uiAnswers,
};
writeFileSync(join(OUT, 'agent-run.trace.json'), JSON.stringify(payload, null, 2));
console.log(
  'wrote trace:',
  payload.events.length,
  'events,',
  payload.plans.length,
  'plan preview(s),',
  payload.approvals.length,
  'approval(s),',
  payload.answeredByHarness.length,
  'gate(s) answered by the harness',
);
for (const e of payload.events.slice(0, 40)) {
  console.log(`  ${String(e.atMs).padStart(6)}ms  ${e.kind.padEnd(18)} ${String(e.message).slice(0, 90)}`);
}

await win.screenshot({ path: join(OUT, 'agent-final.png') });
await app.close();
