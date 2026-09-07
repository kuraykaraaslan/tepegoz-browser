import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordFromOutcomes } from '@tepegoz/orchestrator';
import type { EvalScenario } from '@tepegoz/shared-types';
import { buildReport, type ScenarioResult } from './report';
import type { ScoreResult } from './scorer';

/**
 * The eval driver's reporting helpers. These decide what the sweep's headline SAYS — which model ran,
 * which prior run it is compared against, which scenarios were selected — so a defect here does not
 * break a run, it misreports one. The archived-run reader in particular is a trust boundary: it parses
 * JSON written by an earlier process, and the rules that matter are the ones that make it REFUSE a
 * file (wrong model, different scenario count, corrupt shape) rather than the ones that accept it.
 */

const scenario = (id: string, heldOut = false): EvalScenario => ({
  id,
  task: `task ${id}`,
  target: { fixture: 'f' },
  success: { domAssertion: 'x' },
  heldOut,
  tags: ['smoke'],
});

function result(id: string, ok: boolean, heldOut = false): ScenarioResult {
  const score: ScoreResult = { ok, method: 'ground-truth', reason: ok ? 'found' : 'missing' };
  return {
    scenario: scenario(id, heldOut),
    score,
    record: recordFromOutcomes({
      scenarioId: id,
      stoppedReason: ok ? 'completed' : 'max_steps',
      outcomes: [],
      tokenUsage: { inputTokens: 10, outputTokens: 5 },
      wallClockMs: 1000,
      ok,
    }),
  };
}

/** A real {@link EvalReport} with the given dev / held-out pass rates (2 scenarios per tier). */
function reportWith(devRate: 0 | 0.5 | 1, heldRate: 0 | 0.5 | 1) {
  const tier = (rate: number, prefix: string, heldOut: boolean): ScenarioResult[] => [
    result(`${prefix}1`, rate >= 0.5, heldOut),
    result(`${prefix}2`, rate === 1, heldOut),
  ];
  return buildReport({
    model: 'm',
    threshold: 0.8,
    generatedAt: '2026-09-07T00:00:00.000Z',
    results: [...tier(devRate, 'd', false), ...tier(heldRate, 'h', true)],
  });
}

/** A prior-run archive file, written the way a finished sweep writes one. */
function archive(
  dir: string,
  name: string,
  body: {
    model: string;
    n: number;
    dev: number;
    heldOut: number;
    repeat?: { perScenario: { id: string; passes: number; n: number }[] };
  },
): void {
  writeFileSync(
    join(dir, name),
    JSON.stringify({
      model: body.model,
      n: body.n,
      dev: { metrics: { taskSuccessRate: body.dev } },
      heldOut: { metrics: { taskSuccessRate: body.heldOut } },
      ...(body.repeat !== undefined ? { repeat: body.repeat } : {}),
    }),
    'utf8',
  );
}

describe('latestArchivedRun', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tepegoz-archive-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the directory does not exist (first ever run has no baseline)', async () => {
    const { latestArchivedRun } = await import('./harness-report');
    expect(latestArchivedRun(join(dir, 'nope'), 'm', 2)).toBeNull();
  });

  it('returns null when no archived run matches the model', async () => {
    const { latestArchivedRun } = await import('./harness-report');
    archive(dir, '2026-09-01.json', { model: 'other', n: 2, dev: 0.5, heldOut: 0.5 });
    expect(latestArchivedRun(dir, 'm', 2)).toBeNull();
  });

  it('returns null when the scenario-set size differs — a trend must be like-for-like', async () => {
    const { latestArchivedRun } = await import('./harness-report');
    archive(dir, '2026-09-01.json', { model: 'm', n: 14, dev: 0.5, heldOut: 0.5 });
    expect(latestArchivedRun(dir, 'm', 2)).toBeNull();
  });

  it('picks the NEWEST matching run — ISO-timestamped names sort chronologically', async () => {
    const { latestArchivedRun } = await import('./harness-report');
    archive(dir, '2026-09-01.json', { model: 'm', n: 2, dev: 0.1, heldOut: 0.1 });
    archive(dir, '2026-09-05.json', { model: 'm', n: 2, dev: 0.9, heldOut: 0.8 });
    archive(dir, '2026-09-03.json', { model: 'm', n: 2, dev: 0.5, heldOut: 0.5 });
    expect(latestArchivedRun(dir, 'm', 2)?.dev).toBe(0.9);
  });

  it('skips a file that is not JSON at all and keeps looking', async () => {
    const { latestArchivedRun } = await import('./harness-report');
    writeFileSync(join(dir, '2026-09-05.json'), 'not json {', 'utf8');
    archive(dir, '2026-09-01.json', { model: 'm', n: 2, dev: 0.4, heldOut: 0.3 });
    expect(latestArchivedRun(dir, 'm', 2)?.dev).toBe(0.4);
  });

  it('skips a file whose SHAPE fails the schema and keeps looking', async () => {
    const { latestArchivedRun } = await import('./harness-report');
    writeFileSync(join(dir, '2026-09-05.json'), JSON.stringify({ model: 'm', n: 2 }), 'utf8');
    archive(dir, '2026-09-01.json', { model: 'm', n: 2, dev: 0.4, heldOut: 0.3 });
    expect(latestArchivedRun(dir, 'm', 2)?.dev).toBe(0.4);
  });

  it('ignores non-.json entries in the archive directory', async () => {
    const { latestArchivedRun } = await import('./harness-report');
    writeFileSync(join(dir, 'zzz-notes.md'), 'a note about the sweep', 'utf8');
    archive(dir, '2026-09-01.json', { model: 'm', n: 2, dev: 0.4, heldOut: 0.3 });
    expect(latestArchivedRun(dir, 'm', 2)?.dev).toBe(0.4);
  });

  it('carries the prior per-scenario pass counts when the archived sweep ran with REPEAT>1', async () => {
    const { latestArchivedRun } = await import('./harness-report');
    archive(dir, '2026-09-01.json', {
      model: 'm',
      n: 2,
      dev: 0.5,
      heldOut: 0.5,
      repeat: {
        perScenario: [
          { id: 'a', passes: 2, n: 3 },
          { id: 'b', passes: 0, n: 3 },
        ],
      },
    });
    const prior = latestArchivedRun(dir, 'm', 2);
    expect(prior?.priorPasses?.get('a')).toEqual({ passes: 2, n: 3 });
    expect(prior?.priorPasses?.get('b')).toEqual({ passes: 0, n: 3 });
  });

  it('omits priorPasses entirely when the archived sweep had no repeat block', async () => {
    const { latestArchivedRun } = await import('./harness-report');
    archive(dir, '2026-09-01.json', { model: 'm', n: 2, dev: 0.5, heldOut: 0.5 });
    expect(latestArchivedRun(dir, 'm', 2)?.priorPasses).toBeUndefined();
  });
});

describe('trendLine', () => {
  it('names itself the baseline when there is no comparable prior run', async () => {
    const { trendLine } = await import('./harness-report');
    expect(trendLine(null, reportWith(0.5, 0.5))).toContain('no comparable prior run');
  });

  it('marks an improvement with ▲ and the signed delta', async () => {
    const { trendLine } = await import('./harness-report');
    const line = trendLine({ model: 'old', dev: 0.5, heldOut: 0.5 }, reportWith(1, 1));
    expect(line).toContain('trend vs old');
    expect(line).toContain('dev 50.0%→100.0% (▲ +50.0%)');
    expect(line).toContain('held-out 50.0%→100.0% (▲ +50.0%)');
  });

  it('marks a regression with ▼ — a drop must be as visible as a gain', async () => {
    const { trendLine } = await import('./harness-report');
    const line = trendLine({ model: 'old', dev: 1, heldOut: 1 }, reportWith(0, 0));
    expect(line).toContain('dev 100.0%→0.0% (▼ -100.0%)');
    expect(line).toContain('held-out 100.0%→0.0% (▼ -100.0%)');
  });

  it('reads "= 0.0%" when nothing moved', async () => {
    const { trendLine } = await import('./harness-report');
    const line = trendLine({ model: 'old', dev: 0.5, heldOut: 1 }, reportWith(0.5, 1));
    expect(line).toContain('dev 50.0%→50.0% (= 0.0%)');
    expect(line).toContain('held-out 100.0%→100.0% (= 0.0%)');
  });
});

describe('selectScenarios / modelLabel (env-derived)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  /** `harness-config` reads the env ONCE at module load, so each tier needs a fresh module graph. */
  async function load(env: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    return import('./harness-report');
  }

  it('runs the full registry when the allowlist is empty', async () => {
    const { selectScenarios } = await load({ TEPEGOZ_EVAL_ONLY: '' });
    const all = [scenario('a'), scenario('b')];
    expect(selectScenarios(all)).toBe(all);
  });

  it('keeps only the allowlisted ids and logs the selection', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { selectScenarios } = await load({ TEPEGOZ_EVAL_ONLY: 'b, c' });
    expect(selectScenarios([scenario('a'), scenario('b')]).map((s) => s.id)).toEqual(['b']);
    expect(log.mock.calls[0]?.[0]).toContain('TEPEGOZ_EVAL_ONLY=b,c');
  });

  it('says "(none matched)" rather than printing an empty list when the allowlist hits nothing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { selectScenarios } = await load({ TEPEGOZ_EVAL_ONLY: 'zzz' });
    expect(selectScenarios([scenario('a')])).toEqual([]);
    expect(log.mock.calls[0]?.[0]).toContain('(none matched)');
  });

  it('labels the scripted tier "scripted" — no model is routed there', async () => {
    const { modelLabel } = await load({ TEPEGOZ_EVAL_MODE: undefined });
    expect(modelLabel()).toBe('scripted');
  });

  it('names the ACTUAL routed plan+exec models in the live tier, not just the provider', async () => {
    const { modelLabel } = await load({
      TEPEGOZ_EVAL_MODE: 'live',
      TEPEGOZ_EVAL_PROVIDER: 'anthropic',
    });
    const label = modelLabel();
    expect(label.startsWith('anthropic (plan=')).toBe(true);
    expect(label).toContain('exec=');
    // A weak routed model must be visible in the headline — the label carries real model ids.
    expect(label).not.toContain('plan=)');
  });
});
