import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ModelRouter } from '@tepegoz/model-gateway';
import type { AIProvider, EvalScenario } from '@tepegoz/shared-types';
import type { EvalReport } from './report';
import { MODE, ONLY, PROVIDER_ID } from './harness-config';

/**
 * Reporting helpers for the AI-1 eval driver: the model headline label, the like-for-like prior-run
 * lookup (zod-safe), the {@link ONLY} scenario filter, and the before→after trend line. Kept in a plain
 * (non-`.eval.ts`) sibling so the eval runner's `*.eval.ts` glob does not collect it as its own spec.
 */

/** A prior archived run — read (zod-safe) only to print a dev/held-out before→after trend line. */
const PriorRunSchema = z.object({
  model: z.string(),
  n: z.number(),
  dev: z.object({ metrics: z.object({ taskSuccessRate: z.number() }) }),
  heldOut: z.object({ metrics: z.object({ taskSuccessRate: z.number() }) }),
});

/** Human-readable model label for the report headline: the ACTUAL routed plan+exec model ids (honest
 *  headline — a weak routed model must be visible), not just the provider string. */
export function modelLabel(): string {
  if (MODE !== 'live') return 'scripted';
  const id = PROVIDER_ID as AIProvider;
  const route = (capability: string): string =>
    ModelRouter.route({ capability, costSaver: false, localAvailable: false, provider: id }).model;
  return `${PROVIDER_ID} (plan=${route('plan')}, exec=${route('exec')})`;
}

/** The newest archived run that is COMPARABLE to this one — same model AND same scenario-set size — so the
 *  trend delta is like-for-like (a scripted N=1 vs a live N=14 comparison is meaningless). Null if none. */
export function latestArchivedRun(dir: string, model: string, n: number): { model: string; dev: number; heldOut: number } | null {
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a)); // newest first (ISO-timestamped names sort chronologically)
  } catch {
    return null;
  }
  for (const f of files) {
    let parsed;
    try {
      parsed = PriorRunSchema.safeParse(JSON.parse(readFileSync(join(dir, f), 'utf8')));
    } catch {
      continue;
    }
    if (!parsed.success || parsed.data.model !== model || parsed.data.n !== n) continue;
    return {
      model: parsed.data.model,
      dev: parsed.data.dev.metrics.taskSuccessRate,
      heldOut: parsed.data.heldOut.metrics.taskSuccessRate,
    };
  }
  return null;
}

/** Apply the optional {@link ONLY} scenario allowlist (logs the selection). Empty allowlist → full set. */
export function selectScenarios(loaded: EvalScenario[]): EvalScenario[] {
  if (ONLY.length === 0) return loaded;
  const picked = loaded.filter((s) => ONLY.includes(s.id));
  console.log(
    `filter TEPEGOZ_EVAL_ONLY=${ONLY.join(',')} → running: ${picked.map((s) => s.id).join(', ') || '(none matched)'}`,
  );
  return picked;
}

/** One-line dev/held-out before→after trend vs. the newest prior archived run. */
export function trendLine(prior: { model: string; dev: number; heldOut: number } | null, report: EvalReport): string {
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  if (prior === null) return 'trend: (no comparable prior run — same model + scenario set — this is the baseline)';
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
