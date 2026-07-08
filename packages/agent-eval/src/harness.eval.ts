import { test } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { recordFromOutcomes } from '@tepegoz/orchestrator';
import {
  AnthropicProvider,
  GeminiProvider,
  ModelRouter,
  OpenAIProvider,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { isRunnableProvider, type AIProvider, type EvalScenario } from '@tepegoz/shared-types';
import { loadScenarios } from './scenario-registry';
import { startFixtureServer, fixtureUrl, type FixtureServer } from './fixture-server';
import { scoreScenario } from './scorer';
import { buildReport, formatReportTable, writeReport, type ScenarioResult } from './report';
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
const appEntry = join(repoRoot, 'apps', 'desktop', 'out', 'main', 'index.js');

const MODE = process.env.TEPEGOZ_EVAL_MODE === 'live' ? 'live' : 'scripted';
const PROVIDER_ID = process.env.TEPEGOZ_EVAL_PROVIDER ?? 'anthropic';
const API_KEY = process.env.TEPEGOZ_EVAL_API_KEY ?? '';

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

interface EvalOut {
  summary?: string;
  stoppedReason?: string;
  finalUrl?: string;
  finalPageText?: string;
  error?: string;
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

async function runOne(scenario: EvalScenario, entryUrl: string, extraEnv: Record<string, string>, work: string): Promise<EvalOut> {
  const outPath = join(work, `${scenario.id}.out.json`);
  const app = await electron.launch({
    args: [appEntry],
    env: {
      ...process.env,
      ...extraEnv,
      TEPEGOZ_EVAL: '1',
      TEPEGOZ_EVAL_PROMPT: scenario.task,
      TEPEGOZ_EVAL_FIXTURE_URL: entryUrl,
      TEPEGOZ_EVAL_OUT: outPath,
      ELECTRON_ENABLE_LOGGING: '1',
    },
  });
  const wrote = await waitForFile(outPath, 120_000);
  await app.close().catch(() => undefined);
  return wrote ? (JSON.parse(readFileSync(outPath, 'utf8')) as EvalOut) : { error: 'no output' };
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
  const server = await startFixtureServer(fixturesDir);
  const { scenarios, errors } = loadScenarios(scenariosDir);
  for (const e of errors) console.warn(`[registry] ${e.file}: ${e.reason}`);

  const results: ScenarioResult[] = [];
  const skipped: string[] = [];
  const judgeSamples: JudgeSample[] = [];
  const judge = MODE === 'live' ? judgeComplete() : null;
  const work = mkdtempSync(join(tmpdir(), 'agent-eval-run-'));

  try {
    for (const scenario of scenarios) {
      const plan = planRun(scenario, server, work);
      if (plan === null) {
        skipped.push(scenario.id);
        continue;
      }
      const out = await runOne(scenario, plan.entryUrl, plan.env, work);
      const obs = { finalPageText: out.finalPageText ?? '', summary: out.summary ?? '' };
      let score = scoreScenario({ scenario, ...obs });

      // Open-ended scenario with no ground truth → LLM-judge (live tier only).
      if (score.method === 'deferred-judge' && judge !== null) {
        const verdict = await judgeScenario(scenario, obs, judge);
        score = { ok: verdict.pass, method: 'deferred-judge', reason: `judge: ${verdict.reason}` };
        judgeSamples.push({ id: scenario.id, pass: verdict.pass });
      }

      results.push({
        scenario,
        score,
        record: recordFromOutcomes({
          scenarioId: scenario.id,
          stoppedReason: (out.stoppedReason as ScenarioResult['record']['stoppedReason']) ?? 'tool_error',
          outcomes: [],
          ok: score.ok,
        }),
      });
    }
  } finally {
    await server.close();
  }

  const judgeAgreement = judgeSamples.length > 0 ? agreementRate(judgeSamples, loadHumanLabels(labelsPath)) : undefined;
  const report = buildReport({
    model: MODE === 'live' ? PROVIDER_ID : 'scripted',
    threshold: 0.8,
    generatedAt: new Date().toISOString(),
    results,
    ...(judgeAgreement !== undefined ? { judgeAgreement } : {}),
  });
  console.log(formatReportTable(report));
  if (skipped.length > 0) {
    console.log(`skipped ${String(skipped.length)} scenario(s) not runnable in the ${MODE} tier: ${skipped.join(', ')}`);
  }
  const artifact = writeReport(repoRoot, report);
  console.log(`report → ${artifact}`);
});
