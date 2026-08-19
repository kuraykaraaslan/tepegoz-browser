import { _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { recordFromOutcomes, type StepOutcome } from '@tepegoz/orchestrator';
import {
  AnthropicProvider,
  GeminiProvider,
  KimiProvider,
  ModelRouter,
  OpenAIProvider,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { isRunnableProvider, type AIProvider, type EvalScenario } from '@tepegoz/shared-types';
import { fixtureUrl, type FixtureServer } from './fixture-server';
import { scoreScenario, type ScoreResult } from './scorer';
import { tripEscaped } from './escape-metric';
import type { ScenarioResult } from './report';
import { judgeScenario, type JudgeMessages } from './judge';
import type { JudgeSample } from './calibration';
import { SCRIPTS } from './harness-scripts';
import {
  API_KEY,
  KEEP_RENDERING_WHEN_BACKGROUNDED,
  MODE,
  PROVIDER_ID,
  RATES,
  REPEAT,
  appDir,
} from './harness-config';

/**
 * The per-scenario run engine for the AI-1 eval driver: plan the entry page + env, launch the REAL app via
 * `_electron`, read the zod-safe out-JSON, score (ground-truth first; LLM-judge for judge-only scenarios),
 * and fold {@link REPEAT} trials into one {@link ScenarioResult}. Kept in a plain (non-`.eval.ts`) sibling
 * so the eval runner's `*.eval.ts` glob does not collect it as its own spec.
 */

/** The out-JSON the app runner writes per scenario — untrusted disk input, so `safeParse`d in `runOne`.
 *  `steps` + `tokenUsage` (AI-1 observability) let the harness score real toolCalls/toolErrors/cost. */
const EvalOutSchema = z.object({
  summary: z.string().optional(),
  stoppedReason: z.string().optional(),
  /** S4: what the completion evidence supported, when the run reached a completion verdict. */
  completionOutcome: z.enum(['verified', 'attempted_unverified', 'contradicted']).optional(),
  finalUrl: z.string().optional(),
  finalPageText: z.string().optional(),
  error: z.string().optional(),
  steps: z
    .array(
      z.object({
        tool: z.string(),
        ok: z.boolean(),
        error: z.string().optional(),
        // AI-7: the nav/fetch target URL (when the call had a `url` arg) — feeds the escape-rate metric.
        targetUrl: z.string().optional(),
        // Per-step wall-clock from the reactor — feeds the latency metrics. Optional so a report from
        // an older app build still parses (it simply contributes no timing).
        durationMs: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  tokenUsage: z
    .object({ inputTokens: z.number(), outputTokens: z.number(), totalTokens: z.number() })
    .optional(),
});
type EvalOut = z.infer<typeof EvalOutSchema>;

/**
 * How long one trial may take before the harness gives up on it. Generous because a live trial under 429
 * back-off legitimately runs for minutes; still bounded so `REPEAT=3` fits inside the Playwright test
 * timeout. A trial that exceeds this is reported as CUT OFF, never as the agent getting it wrong.
 */
const TRIAL_TIMEOUT_MS = 900_000;

/** The marker `runOne` returns when a trial never produced output — a trial that did not finish, which
 *  is evidence about the harness/budget, NOT about the agent's competence. */
export const CUT_OFF = 'no output';

/** stoppedReasons that mean a TRANSPORT/infra failure terminated the run before the agent could show
 *  competence — a cold-start launch race, a failed fixture navigation, ERR_FAILED / "No active page" —
 *  all funnelled into the broad `navigation_timeout` / `transient_error` bucket by the recovery
 *  classifier. Scored naively these look identical to a wrong answer (empty page → every assertion
 *  fails), which is exactly how a flaky machine has quietly deflated every k/N the harness ever
 *  produced. They are RETRIED, then EXCLUDED from the denominator — never a competence fail. */
const TRANSPORT_STOPPED_REASONS = new Set(['navigation_timeout', 'transient_error']);

/** Extra relaunches for a transport-invalid trial. A cold-start race almost always clears on a warm
 *  retry, so this recovers the trial instead of losing the whole (paid) sweep to a flake. */
const MAX_TRANSPORT_RETRIES = 2;

/** A DEAD-KEY / account error: the provider rejected the request for BILLING / QUOTA / AUTH reasons, so
 *  the model never reasoned about the task and NO retry can help — the key itself is exhausted or
 *  unauthorized. Observed mid-sweep as `AppError: 400 {..."credit balance is too low ... Plans & Billing"}`.
 *  Scored naively it looks like the agent failing every REMAINING scenario; really the sweep must stop and
 *  those trials are UNMEASURED. (This is what silently turned a real Anthropic sweep into garbage the moment
 *  the key ran out of credits.) */
const DEAD_KEY_RE =
  /credit balance|Plans & Billing|insufficient[_ ]?quota|\bquota\b|invalid[_ ]?api[_ ]?key|\b401\b|authentication_error|permission_error/i;

/** A TRANSIENT infra error surfaced in the run's error string (rate limit / overload / network) — invalid
 *  like a cold-start transport race and worth a retry, UNLIKE a dead key which no retry fixes. */
const TRANSIENT_ERROR_RE = /\b429\b|rate[_ ]?limit|overloaded|\b529\b|\b503\b|ECONNRESET|ETIMEDOUT|socket hang up/i;

/** True when the provider key is exhausted/unauthorized (billing/quota/auth) — the sweep should ABORT, not
 *  keep launching doomed trials, and the affected trials are UNMEASURED, never competence fails. */
export function isDeadKeyError(out: EvalOut): boolean {
  return out.error !== undefined && out.error !== CUT_OFF && DEAD_KEY_RE.test(out.error);
}

/** True when a trial is INFRA-invalid (NOT competence evidence): no output (CUT_OFF), a transient API error
 *  (rate limit / overload / network), or a transport error that stopped the run. An ESCAPE that ends in a
 *  nav timeout (the agent navigated off-site to an unreachable URL and spun out) is a real competence
 *  FAILURE, so an escaped trial is never excused — the escape flag tells the two apart. A dead-key error is
 *  handled separately (it aborts rather than retries). */
export function isTransportInvalid(out: EvalOut, escaped: boolean): boolean {
  if (out.error === CUT_OFF) return true;
  if (out.error !== undefined && TRANSIENT_ERROR_RE.test(out.error)) return true;
  return !escaped && TRANSPORT_STOPPED_REASONS.has(out.stoppedReason ?? '');
}

async function waitForFile(path: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return existsSync(path);
}

/** The page the agent starts on + the app env for one scenario. Returns null when the scenario can't run
 *  in this tier (scripted tier + no scripted sequence, or a realUrl target off the live tier). */
export function planRun(
  scenario: EvalScenario,
  server: FixtureServer,
  work: string,
): { entryUrl: string; env: Record<string, string> } | null {
  if (MODE === 'scripted') {
    const script = SCRIPTS[scenario.id];
    if (script === undefined || !('fixture' in scenario.target)) return null;
    const { entryUrl, replies } = script(fixtureUrl(server.url, scenario.target.fixture));
    const scriptPath = join(work, `${scenario.id}.script.json`);
    writeFileSync(scriptPath, JSON.stringify({ provider: 'anthropic', replies }), 'utf8');
    return { entryUrl, env: { TEPEGOZ_EVAL_MODE: 'scripted', TEPEGOZ_EVAL_SCRIPT: scriptPath } };
  }
  // live
  const entryUrl = 'fixture' in scenario.target
    ? `${fixtureUrl(server.url, scenario.target.fixture)}index.html`
    : scenario.target.realUrl;
  return {
    entryUrl,
    env: { TEPEGOZ_EVAL_MODE: 'live', TEPEGOZ_EVAL_PROVIDER: PROVIDER_ID, TEPEGOZ_EVAL_API_KEY: API_KEY },
  };
}

async function runOne(
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
  writeFileSync(join(profileDir, 'preferences.json'), JSON.stringify({ onboardingCompleted: true }), 'utf8');
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

/** A driver-side judge model call (independent of the agent under test), built from the live env key. */
export function judgeComplete(): (m: JudgeMessages) => Promise<string> {
  if (!isRunnableProvider(PROVIDER_ID as AIProvider) || API_KEY.length === 0) {
    return () => Promise.resolve('{"pass":false,"confidence":0,"reason":"no judge model configured"}');
  }
  const id = PROVIDER_ID as AIProvider;
  let provider: ModelProvider;
  if (id === 'openai') provider = new OpenAIProvider({ apiKey: API_KEY });
  else if (id === 'gemini') provider = new GeminiProvider({ apiKey: API_KEY });
  else if (id === 'kimi') provider = new KimiProvider({ apiKey: API_KEY });
  else provider = new AnthropicProvider({ apiKey: API_KEY });
  const route = ModelRouter.route({ capability: 'exec', costSaver: false, localAvailable: false, provider: id });
  return async ({ system, user }) => {
    const res = await provider.complete(
      {
        provider: id,
        model: route.model,
        capability: 'classify',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        maxTokens: 512,
        timeoutMs: 60_000,
        responseFormat: 'json',
      },
      new AbortController().signal,
    );
    return res.text;
  };
}

/** Score ONE trial's output (ground-truth first; LLM-judge for judge-only scenarios in the live tier). */
async function scoreTrial(
  scenario: EvalScenario,
  out: EvalOut,
  judge: ((m: JudgeMessages) => Promise<string>) | null,
  judgeSamples: JudgeSample[],
): Promise<ScoreResult> {
  const obs = { finalPageText: out.finalPageText ?? '', summary: out.summary ?? '' };
  let score = scoreScenario({
    scenario,
    ...obs,
    ...(out.stoppedReason !== undefined ? { stoppedReason: out.stoppedReason } : {}),
  });
  if (score.method === 'deferred-judge' && judge !== null) {
    const verdict = await judgeScenario(scenario, obs, judge);
    score = { ok: verdict.pass, method: 'deferred-judge', reason: `judge: ${verdict.reason}` };
    judgeSamples.push({ id: scenario.id, pass: verdict.pass });
  }
  return score;
}

/** Run a scenario {@link REPEAT} times and fold the trials into ONE {@link ScenarioResult}: `ok` is the
 *  MAJORITY verdict, the reason carries the k/N pass-frequency, tokens are SUMMED (honest cost). Returns
 *  the fold plus the raw pass count so the caller can also report a per-scenario frequency + mean. */
export async function runScenarioTrials(
  scenario: EvalScenario,
  plan: { entryUrl: string; env: Record<string, string> },
  work: string,
  logsDir: string,
  judge: ((m: JudgeMessages) => Promise<string>) | null,
  judgeSamples: JudgeSample[],
): Promise<{
  result: ScenarioResult;
  passes: number;
  escapes: number;
  escapeEligible: boolean;
  /** VALID trials scored for this scenario (transport-invalid excluded) — the honest k/N denominator. */
  validN: number;
  /** Eligible VALID trials for the escape denominator (`validN` when escape-scorable, else 0). */
  escapeN: number;
  /** The provider key ran out of credits / was unauthorized during this scenario — the caller must ABORT
   *  the sweep (every remaining trial would just fail the same way). */
  deadKey: boolean;
}> {
  const scores: ScoreResult[] = [];
  // M1: END-TO-END wall-clock per trial (launch → result, model thinking included) — the wait a user
  // actually experiences; sum-of-steps alone systematically under-reports it.
  const wallClocksMs: number[] = [];
  // AI-7 escape is measured only over fixture "sites" (a sub-path directory); realUrl scenarios are
  // open-web tasks where leaving the origin is legitimate, so they are not escape-scored.
  const siteBase = plan.entryUrl.replace(/[^/]*$/, '');
  const escapeEligible = 'fixture' in scenario.target;
  const escapedTrial = (o: EvalOut): boolean =>
    escapeEligible && tripEscaped(o.steps, siteBase, plan.entryUrl);

  const validOuts: EvalOut[] = []; // scored trials (transport-invalid excluded) — the competence evidence
  const allOuts: EvalOut[] = []; // every attempt incl. abandoned retries — honest token/cost accounting
  let transportInvalid = 0; // trials abandoned as transport-invalid even AFTER retries (excluded from k/N)
  let transportRetries = 0; // extra relaunches spent recovering cold-start flakes (cost, not competence)
  let deadKey = false; // the provider key ran out of credits / auth mid-scenario — stop, don't keep launching

  for (let t = 0; t < REPEAT; t++) {
    const suffix = REPEAT > 1 ? `.t${String(t + 1)}` : '';
    let out: EvalOut = { error: CUT_OFF };
    for (let attempt = 0; ; attempt++) {
      const logName = `${scenario.id}${suffix}${attempt > 0 ? `.retry${String(attempt)}` : ''}.log`;
      const startedAt = Date.now();
      out = await runOne(scenario, plan.entryUrl, plan.env, work, join(logsDir, logName));
      wallClocksMs.push(Math.max(0, Date.now() - startedAt));
      allOuts.push(out);
      if (isDeadKeyError(out)) break; // no retry — the key is exhausted/unauthorized, a relaunch can't help
      if (!isTransportInvalid(out, escapedTrial(out)) || attempt >= MAX_TRANSPORT_RETRIES) break;
      transportRetries++;
    }
    if (isDeadKeyError(out)) {
      deadKey = true; // UNMEASURED (billing/quota/auth), never a competence fail — and abort the scenario
      transportInvalid++;
      break;
    }
    if (isTransportInvalid(out, escapedTrial(out))) {
      transportInvalid++; // NOT scored — a launch/navigation flake is not the agent getting it wrong
      continue;
    }
    validOuts.push(out);
    scores.push(await scoreTrial(scenario, out, judge, judgeSamples));
  }

  const passes = scores.filter((s) => s.ok).length;
  const validN = scores.length; // the honest denominator — VALID trials only
  const ok = validN > 0 && passes * 2 >= validN; // majority over valid trials (0 valid ⇒ not a pass)
  // Prefer the last VALID out for the record; fall back to the last attempt so an all-invalid scenario
  // still surfaces its transport stoppedReason instead of a bare default.
  const last = validOuts[validOuts.length - 1] ?? allOuts[allOuts.length - 1] ?? {};
  const outcomes: StepOutcome[] = (last.steps ?? []).map((s) => ({
    stepId: '',
    tool: s.tool,
    ok: s.ok,
    durationMs: s.durationMs ?? 0,
  }));
  // Honest cost includes the abandoned attempts — they really did burn tokens/API spend.
  const inputTokens = allOuts.reduce((n, o) => n + (o.tokenUsage?.inputTokens ?? 0), 0);
  const outputTokens = allOuts.reduce((n, o) => n + (o.tokenUsage?.outputTokens ?? 0), 0);
  const escapes = validOuts.filter((o) => escapedTrial(o)).length;
  const escapeN = escapeEligible ? validN : 0; // escape denominator = valid eligible trials
  const escaped = escapeEligible && validN > 0 && escapes * 2 >= validN;
  // Transport-invalid trials are NOT competence evidence — surfaced explicitly so a flaky launch reads as
  // "excluded", never as the agent getting it wrong (the pooled CI already drops them via a smaller n).
  const invalidNote =
    transportInvalid > 0
      ? ` — ${String(transportInvalid)}/${String(REPEAT)} transport-invalid, EXCLUDED` +
        (transportRetries > 0
          ? ` (after ${String(transportRetries)} retr${transportRetries === 1 ? 'y' : 'ies'})`
          : '')
      : transportRetries > 0
        ? ` — recovered ${String(transportRetries)} transport-flake(s) via retry`
        : '';
  // A dead key (billing/quota/auth) makes the rest of the scenario UNMEASURED, never a competence fail —
  // and signals the caller to abort the sweep rather than launch more doomed trials.
  const deadKeyNote = deadKey ? ' — API key exhausted/unauthorized (billing/quota); sweep aborted' : '';
  const failReason = scores.find((s) => !s.ok)?.reason;
  const reason =
    validN === 0
      ? `UNMEASURED — ${deadKey ? 'API key exhausted/unauthorized (billing/quota)' : `all ${String(REPEAT)} trial(s) transport-invalid`}${invalidNote}`
      : REPEAT > 1
        ? `${String(passes)}/${String(validN)} passed${invalidNote}${deadKeyNote}${!ok && failReason !== undefined ? ` — e.g. ${failReason}` : ''}`
        : `${scores[0]?.reason ?? CUT_OFF}${invalidNote}${deadKeyNote}`;
  const result: ScenarioResult = {
    scenario,
    score: { ok, method: scores[0]?.method ?? 'ground-truth', reason },
    // S4: the LAST trial's verdict. Folding repeats into one outcome would need its own rule; the last
    // trial is the one whose page state and summary the score above was taken from.
    ...(last.completionOutcome !== undefined ? { completionOutcome: last.completionOutcome } : {}),
    record: recordFromOutcomes({
      scenarioId: scenario.id,
      stoppedReason: (last.stoppedReason as ScenarioResult['record']['stoppedReason']) ?? 'tool_error',
      outcomes,
      tokenUsage: { inputTokens, outputTokens },
      wallClockMs: wallClocksMs.reduce((sum, ms) => sum + ms, 0),
      wallClocksMs,
      tokenRateUsd: RATES,
      ok,
      escaped,
      // Only fixture "sites" are eligible for the escape signal; a realUrl (open-web) task is excluded so
      // it can't dilute the on-page escape rate.
      escapeEligible,
    }),
  };
  return { result, passes, escapes, escapeEligible, validN, escapeN, deadKey };
}
