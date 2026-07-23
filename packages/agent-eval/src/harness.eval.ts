import { test } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenarios } from './scenario-registry';
import { startFixtureServer } from './fixture-server';
import { buildReport, formatReportTable, writeReport, type ScenarioResult } from './report';
import { agreementRate, loadHumanLabels, type JudgeSample } from './calibration';
import {
  MODE,
  REPEAT,
  appEntry,
  fixturesDir,
  labelsPath,
  repoRoot,
  scenariosDir,
} from './harness-config';
import { latestArchivedRun, modelLabel, selectScenarios, trendLine } from './harness-report';
import { judgeComplete, planRun, runScenarioTrials } from './harness-run';

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
 *
 * The cohesive setup/reporting/run helpers live in the plain `harness-*.ts` siblings (kept out of the
 * `*.eval.ts` glob so the eval runner does not collect them as their own specs); this entry file keeps
 * the Playwright test declaration.
 */
test('agent-eval — drive the real app and score competence', async () => {
  test.setTimeout(3_600_000);
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

  // Per-scenario pass frequency across REPEAT trials — feeds the honest mean pass-rate + frequency table.
  const freq: Array<{ id: string; heldOut: boolean; passes: number }> = [];
  try {
    for (const scenario of scenarios) {
      const plan = planRun(scenario, server, work);
      if (plan === null) {
        skipped.push(scenario.id);
        continue;
      }
      const { result, passes } = await runScenarioTrials(scenario, plan, work, logsDir, judge, judgeSamples);
      results.push(result);
      freq.push({ id: scenario.id, heldOut: scenario.heldOut, passes });
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
  if (REPEAT > 1) {
    // The table above is the MAJORITY verdict per scenario; also surface the per-scenario pass-frequency
    // and the MEAN per-trial pass-rate — the granular, less-noisy honest number for a flaky agent.
    const pctOf = (n: number): string => `${(n * 100).toFixed(1)}%`;
    const mean = (rows: typeof freq): number =>
      rows.length === 0 ? 0 : rows.reduce((s, f) => s + f.passes / REPEAT, 0) / rows.length;
    const devRows = freq.filter((f) => !f.heldOut);
    const heldRows = freq.filter((f) => f.heldOut);
    console.log(
      `repeat=${String(REPEAT)} · MEAN per-trial pass-rate: dev ${pctOf(mean(devRows))} · held-out ${pctOf(mean(heldRows))}`,
    );
    for (const f of freq) {
      console.log(`  ${String(f.passes)}/${String(REPEAT)}  ${f.heldOut ? '[held-out] ' : ''}${f.id}`);
    }
  }
  if (skipped.length > 0) {
    console.log(`skipped ${String(skipped.length)} scenario(s) not runnable in the ${MODE} tier: ${skipped.join(', ')}`);
  }
  // Read the newest prior archived run BEFORE writing this one, so the trend compares against the last
  // run and not itself; then archive this run under a timestamped, git-ignored name for the before/after
  // history the iterative loop depends on, and keep the fixed latest-pointer for existing tooling/CI.
  const prior = latestArchivedRun(archiveDir, report.model, report.n);
  const artifact = writeReport(repoRoot, report);
  const archived = writeReport(archiveDir, report, `${runTag}-${MODE}.json`);
  console.log(trendLine(prior, report));
  console.log(`report → ${artifact}`);
  console.log(`archived → ${archived}`);
  console.log(`scenario logs → ${logsDir}`);
});
