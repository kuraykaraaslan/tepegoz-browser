import { test, _electron as electron } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
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
import { loadScenarios } from './scenario-registry';
import { startFixtureServer, fixtureUrl, type FixtureServer } from './fixture-server';
import { scoreScenario } from './scorer';
import { buildReport, formatReportTable, writeReport, type EvalReport, type ScenarioResult } from './report';
import { judgeScenario, type JudgeMessages } from './judge';
import { agreementRate, loadHumanLabels, type JudgeSample } from './calibration';

/**
 * AI-1 eval driver. Launches the REAL app via `_electron` and drives each scenario through the
 * production path (real BrowserHost + Policy/HITL plane), swapping only the model. Two tiers:
 *  - `scripted` (default): a `ScriptedProvider` sequence — deterministic, no cloud key. Runs only the
 *    scenarios with a scripted sequence below (others are skipped + logged; no silent cap).
 *  - `live` (`TEPEGOZ_EVAL_MODE=live` + `TEPEGOZ_EVAL_PROVIDER` + `TEPEGOZ_EVAL_API_KEY`): the REAL
 *    product model over the full registry (honest competence). Open-ended scenarios (a `judgeRubric`
 *    with no ground truth) are graded by the LLM-judge, whose verdicts are calibrated against the
 *    human-labelled sample and reported as an agreement rate.
 *
 * Held-out scenarios are reported separately (never used to tune a fix). Run via `pnpm eval`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const fixturesDir = join(repoRoot, 'test-fixtures', 'sites');
const scenariosDir = join(here, '..', 'scenarios');
const labelsPath = join(here, '..', 'calibration', 'human-labels.json');
// Launch the app DIRECTORY (Electron resolves the entry via apps/desktop/package.json "main"), NOT the
// built entry file directly. Passing out/main/index.js makes Electron set app.getAppPath() to out/main/,
// so every getAppPath()-relative resource read (the extension catalog, model/typo catalogs, brand icon
// under resources/) resolves against out/main/resources/ — which `electron-vite build` does not populate
// — and the app throws "Failed to read extension catalog" at startup. Launching the dir keeps
// getAppPath() = apps/desktop, so resources/ resolves to the real apps/desktop/resources.
const appDir = join(repoRoot, 'apps', 'desktop');
const appEntry = join(appDir, 'out', 'main', 'index.js');

const MODE = process.env.TEPEGOZ_EVAL_MODE === 'live' ? 'live' : 'scripted';
const PROVIDER_ID = process.env.TEPEGOZ_EVAL_PROVIDER ?? 'anthropic';
const API_KEY = process.env.TEPEGOZ_EVAL_API_KEY ?? '';
// Optional comma-separated scenario-id allowlist (`TEPEGOZ_EVAL_ONLY=native_select_country,blog_behind_menu`)
// so an iteration re-runs just the target(s) + a tripwire instead of the whole registry — a full live
// run is minutes-per-scenario under a low-TPM key. Empty → the full registry (baselines / boundaries).
const ONLY = (process.env.TEPEGOZ_EVAL_ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const act = (tool: string, args: Record<string, unknown>, rationale: string): string =>
  JSON.stringify({ action: 'act', tool, args, rationale });
const finish = (summary: string): string => JSON.stringify({ action: 'finish', summary });

/** A scripted model sequence for one scenario (deterministic tier), given the fixture's base URL. */
type Script = (base: string) => { entryUrl: string; replies: string[] };

const SCRIPTS: Record<string, Script> = {
  blog_behind_menu: (base) => {
    const blogUrl = `${base}blog.html`;
    return {
      entryUrl: `${base}index.html`,
      replies: [
        JSON.stringify({
          goal: 'Open the blog and read the latest post title',
          steps: [
            { id: 's1', tool: 'browser_update_location', args: { url: blogUrl }, rationale: 'go to the blog', dependsOn: [] },
            { id: 's2', tool: 'browser_get_page', args: {}, rationale: 'read the blog', dependsOn: ['s1'] },
          ],
        }),
        act('browser_update_location', { url: blogUrl }, 'navigate straight to the blog page'),
        act('browser_get_page', {}, 'read the blog page'),
        finish('The latest post is: Shipping the new perception pipeline'),
      ],
    };
  },
};

/** The out-JSON the app runner writes per scenario — untrusted disk input, so `safeParse`d in `runOne`.
 *  `steps` + `tokenUsage` (AI-1 observability) let the harness score real toolCalls/toolErrors/cost. */
const EvalOutSchema = z.object({
  summary: z.string().optional(),
  stoppedReason: z.string().optional(),
  finalUrl: z.string().optional(),
  finalPageText: z.string().optional(),
  error: z.string().optional(),
  steps: z.array(z.object({ tool: z.string(), ok: z.boolean(), error: z.string().optional() })).optional(),
  tokenUsage: z
    .object({ inputTokens: z.number(), outputTokens: z.number(), totalTokens: z.number() })
    .optional(),
});
type EvalOut = z.infer<typeof EvalOutSchema>;

/** A prior archived run — read (zod-safe) only to print a dev/held-out before→after trend line. */
const PriorRunSchema = z.object({
  model: z.string(),
  dev: z.object({ metrics: z.object({ taskSuccessRate: z.number() }) }),
  heldOut: z.object({ metrics: z.object({ taskSuccessRate: z.number() }) }),
});

/** Human-readable model label for the report headline: the ACTUAL routed plan+exec model ids (honest
 *  headline — a weak routed model must be visible), not just the provider string. */
function modelLabel(): string {
  if (MODE !== 'live') return 'scripted';
  const id = PROVIDER_ID as AIProvider;
  const route = (capability: string): string =>
    ModelRouter.route({ capability, costSaver: false, localAvailable: false, provider: id }).model;
  return `${PROVIDER_ID} (plan=${route('plan')}, exec=${route('exec')})`;
}

/** The newest archived run's dev/held-out pass rates (or null on the first run) — for the trend line. */
function latestArchivedRun(dir: string): { model: string; dev: number; heldOut: number } | null {
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
  const last = files.at(-1);
  if (last === undefined) return null;
  try {
    const parsed = PriorRunSchema.safeParse(JSON.parse(readFileSync(join(dir, last), 'utf8')));
    if (!parsed.success) return null;
    return {
      model: parsed.data.model,
      dev: parsed.data.dev.metrics.taskSuccessRate,
      heldOut: parsed.data.heldOut.metrics.taskSuccessRate,
    };
  } catch {
    return null;
  }
}

/** Apply the optional {@link ONLY} scenario allowlist (logs the selection). Empty allowlist → full set. */
function selectScenarios(loaded: EvalScenario[]): EvalScenario[] {
  if (ONLY.length === 0) return loaded;
  const picked = loaded.filter((s) => ONLY.includes(s.id));
  console.log(
    `filter TEPEGOZ_EVAL_ONLY=${ONLY.join(',')} → running: ${picked.map((s) => s.id).join(', ') || '(none matched)'}`,
  );
  return picked;
}

/** One-line dev/held-out before→after trend vs. the newest prior archived run. */
function trendLine(prior: { model: string; dev: number; heldOut: number } | null, report: EvalReport): string {
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  if (prior === null) return 'trend: (no prior archived run — this is the baseline)';
  const arrow = (d: number): string => {
    if (d > 0) return `▲ +${pct(d)}`;
    if (d < 0) return `▼ ${pct(d)}`;
    return '= 0.0%';
  };
  const dev = report.dev.metrics.taskSuccessRate;
  const held = report.heldOut.metrics.taskSuccessRate;
  return (
    `trend vs ${prior.model}: ` +
    `dev ${pct(prior.dev)}→${pct(dev)} (${arrow(dev - prior.dev)}) · ` +
    `held-out ${pct(prior.heldOut)}→${pct(held)} (${arrow(held - prior.heldOut)})`
  );
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
function planRun(
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
  const outPath = join(work, `${scenario.id}.out.json`);
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
  const app = await electron.launch({ args: [appDir], env: launchEnv });
  // Capture the app's stdout/stderr (the `[eval] <kind>` step trace + Chromium logs) so a FAIL can be
  // diagnosed at step granularity. Best-effort — never fail the run on a log-write error.
  const logChunks: string[] = [];
  const proc = app.process();
  proc.stdout?.on('data', (d: Buffer) => logChunks.push(d.toString()));
  proc.stderr?.on('data', (d: Buffer) => logChunks.push(d.toString()));
  // Headroom for a live run whose model calls back off on 429 rate limits (a scenario legitimately takes
  // longer under a low-TPM key). The overall Playwright test timeout still bounds the whole run.
  const wrote = await waitForFile(outPath, 300_000);
  await app.close().catch(() => undefined);
  try {
    writeFileSync(logPath, logChunks.join(''), 'utf8');
  } catch {
    // best-effort log capture
  }
  if (!wrote) return { error: 'no output' };
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
function judgeComplete(): (m: JudgeMessages) => Promise<string> {
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

test('agent-eval — drive the real app and score competence', async () => {
  test.setTimeout(1_800_000);
  if (!existsSync(appEntry)) {
    throw new Error(
      `desktop app not built at ${appEntry} — run \`pnpm --filter @tepegoz/desktop build\` (\`pnpm eval\` does this first).`,
    );
  }
  const server = await startFixtureServer(fixturesDir);
  const { scenarios: loaded, errors } = loadScenarios(scenariosDir);
  for (const e of errors) console.warn(`[registry] ${e.file}: ${e.reason}`);
  const scenarios = selectScenarios(loaded);

  const results: ScenarioResult[] = [];
  const skipped: string[] = [];
  const judgeSamples: JudgeSample[] = [];
  const judge = MODE === 'live' ? judgeComplete() : null;
  const work = mkdtempSync(join(tmpdir(), 'agent-eval-run-'));
  // Timestamped, git-ignored run directory: per-scenario logs live here and the archived report is
  // named from the same tag, so a run's logs + numbers are correlatable and the trend is chronological.
  const runStartedAt = new Date().toISOString();
  const runTag = runStartedAt.replace(/[:.]/g, '-');
  const archiveDir = join(repoRoot, 'agent-eval-runs');
  const logsDir = join(archiveDir, `${runTag}-${MODE}-logs`);
  mkdirSync(logsDir, { recursive: true });

  try {
    for (const scenario of scenarios) {
      const plan = planRun(scenario, server, work);
      if (plan === null) {
        skipped.push(scenario.id);
        continue;
      }
      const out = await runOne(scenario, plan.entryUrl, plan.env, work, join(logsDir, `${scenario.id}.log`));
      const obs = { finalPageText: out.finalPageText ?? '', summary: out.summary ?? '' };
      let score = scoreScenario({ scenario, ...obs });

      // Open-ended scenario with no ground truth → LLM-judge (live tier only).
      if (score.method === 'deferred-judge' && judge !== null) {
        const verdict = await judgeScenario(scenario, obs, judge);
        score = { ok: verdict.pass, method: 'deferred-judge', reason: `judge: ${verdict.reason}` };
        judgeSamples.push({ id: scenario.id, pass: verdict.pass });
      }

      // Real per-step outcomes + token usage from the run (AI-1 observability) → honest toolCalls,
      // toolErrors, navigationValidation counts, and cost, instead of the previous hard-coded zeros.
      const outcomes: StepOutcome[] = (out.steps ?? []).map((s) => ({ stepId: '', tool: s.tool, ok: s.ok }));
      results.push({
        scenario,
        score,
        record: recordFromOutcomes({
          scenarioId: scenario.id,
          stoppedReason: (out.stoppedReason as ScenarioResult['record']['stoppedReason']) ?? 'tool_error',
          outcomes,
          ...(out.tokenUsage !== undefined
            ? {
                tokenUsage: {
                  inputTokens: out.tokenUsage.inputTokens,
                  outputTokens: out.tokenUsage.outputTokens,
                },
              }
            : {}),
          ok: score.ok,
        }),
      });
    }
  } finally {
    await server.close();
  }

  const judgeAgreement = judgeSamples.length > 0 ? agreementRate(judgeSamples, loadHumanLabels(labelsPath)) : undefined;
  const report = buildReport({
    model: modelLabel(),
    threshold: 0.8,
    generatedAt: runStartedAt,
    results,
    ...(judgeAgreement !== undefined ? { judgeAgreement } : {}),
  });
  console.log(formatReportTable(report));
  if (skipped.length > 0) {
    console.log(`skipped ${String(skipped.length)} scenario(s) not runnable in the ${MODE} tier: ${skipped.join(', ')}`);
  }
  // Read the newest prior archived run BEFORE writing this one, so the trend compares against the last
  // run and not itself; then archive this run under a timestamped, git-ignored name for the before/after
  // history the iterative loop depends on, and keep the fixed latest-pointer for existing tooling/CI.
  const prior = latestArchivedRun(archiveDir);
  const artifact = writeReport(repoRoot, report);
  const archived = writeReport(archiveDir, report, `${runTag}-${MODE}.json`);
  console.log(trendLine(prior, report));
  console.log(`report → ${artifact}`);
  console.log(`archived → ${archived}`);
  console.log(`scenario logs → ${logsDir}`);
});
