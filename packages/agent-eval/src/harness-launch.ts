import { _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalScenario } from '@tepegoz/shared-types';
import { CUT_OFF, EvalOutSchema, type EvalOut } from './harness-out';
import { KEEP_RENDERING_WHEN_BACKGROUNDED, appDir } from './harness-config';

/**
 * How long one trial may take before the harness gives up on it. Generous because a live trial under 429
 * back-off legitimately runs for minutes; still bounded so `REPEAT=3` fits inside the Playwright test
 * timeout. A trial that exceeds this is reported as CUT OFF, never as the agent getting it wrong.
 */
const TRIAL_TIMEOUT_MS = 900_000;

async function waitForFile(path: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return existsSync(path);
}

export async function runOne(
  scenario: EvalScenario,
  entryUrl: string,
  extraEnv: Record<string, string>,
  work: string,
  logPath: string,
): Promise<EvalOut> {
  // A FRESH profile per trial (see below) doubles as this trial's unique identity, so the out-file is
  // per-trial too.
  //
  // It used to be `${scenario.id}.out.json`, shared by every repeat of a scenario — and that single line
  // invalidated every N>1 measurement the harness has ever produced. Trial 1 runs and writes the file;
  // trial 2 launches, `waitForFile` finds trial 1's file INSTANTLY, the harness declares the trial done
  // and calls `app.close()` — killing the app mid-run (hence the "target closed while handling command"
  // and "Tab failed to load" errors) — and then scores trial 1's output AGAIN as trial 2's. A `k/N`
  // pass-frequency was really one trial's verdict counted N times.
  const profileDir = mkdtempSync(join(work, 'profile-'));
  const outPath = join(profileDir, 'eval-out.json');
  // Start already-onboarded. A fresh profile otherwise boots into the ONBOARDING surface, which REPLACES
  // the whole browser chrome — so the `App` component that measures the content area and reports its
  // bounds over IPC never mounts, the tab content view stays 0×0, and the agent's perception sees zero
  // elements (the "no interactable elements" blindness). Seeding `onboardingCompleted: true` into the
  // profile's prefs BEFORE launch makes the app boot the real browser chrome + a real tab — the state
  // every agent-running user is actually in. `PreferenceStore.init` reads this as a patch and fills the
  // rest from defaults, so a single-key file validates. With `--user-data-dir=profileDir`, userData IS
  // profileDir, so this is the file the app reads at startup.
  writeFileSync(
    join(profileDir, 'preferences.json'),
    JSON.stringify({ onboardingCompleted: true }),
    'utf8',
  );
  // Electron must launch as a REAL GUI app. Agent/CI shells (this one included) often set
  // ELECTRON_RUN_AS_NODE=1, which makes electron.exe run as plain Node — no `app` object,
  // `require('electron')` returns a path string — so the app throws at startup and Playwright
  // surfaces only "Process failed to launch". Drop it here, exactly like `pnpm dev` does
  // (apps/desktop/scripts/dev.mjs), so the harness is robust to the ambient env.
  const launchEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') launchEnv[k] = v;
  }
  Object.assign(launchEnv, extraEnv, {
    TEPEGOZ_EVAL: '1',
    TEPEGOZ_EVAL_PROMPT: scenario.task,
    TEPEGOZ_EVAL_FIXTURE_URL: entryUrl,
    TEPEGOZ_EVAL_OUT: outPath,
    ELECTRON_ENABLE_LOGGING: '1',
  });
  // The fresh profile also keeps trials from inheriting each other's persisted session and window bounds
  // — and keeps the harness out of the developer's real `AppData/Roaming/tepegoz` entirely.
  // Switches BEFORE the app path go to Chromium/Electron; the app path is the first positional arg.
  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, ...KEEP_RENDERING_WHEN_BACKGROUNDED, appDir],
    env: launchEnv,
  });
  // Capture the app's stdout/stderr (the `[eval] <kind>` step trace + Chromium logs) so a FAIL can be
  // diagnosed at step granularity. Best-effort — never fail the run on a log-write error.
  const logChunks: string[] = [];
  const proc = app.process();
  proc.stdout?.on('data', (d: Buffer) => logChunks.push(d.toString()));
  proc.stderr?.on('data', (d: Buffer) => logChunks.push(d.toString()));
  // Headroom for a live run whose model calls back off on 429 rate limits (a scenario legitimately takes
  // longer under a low-TPM key). The overall Playwright test timeout still bounds the whole run.
  //
  // 300s was NOT enough: measured on a live gpt-4o run, 2 of 3 trials were still working (15 and 13 tool
  // calls in) when the wait expired, and killing them produced empty output that the scorer could not
  // distinguish from the agent answering wrongly. Every number was biased downward by whichever trials
  // happened to be slow.
  const wrote = await waitForFile(outPath, TRIAL_TIMEOUT_MS);
  await app.close().catch(() => undefined);
  try {
    writeFileSync(logPath, logChunks.join(''), 'utf8');
  } catch {
    // best-effort log capture
  }
  if (!wrote) return { error: CUT_OFF };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(outPath, 'utf8'));
  } catch {
    return { error: 'out-json parse error' };
  }
  const parsed = EvalOutSchema.safeParse(raw);
  return parsed.success
    ? parsed.data
    : { error: `invalid out-json: ${parsed.error.issues.map((i) => i.message).join('; ')}` };
}
