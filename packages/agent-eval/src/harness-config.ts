import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { TokenRateUsd } from '@tepegoz/orchestrator';

/**
 * Static setup for the AI-1 eval driver: repo/app/fixture paths and the env-derived run knobs
 * ({@link MODE}/{@link PROVIDER_ID}/{@link REPEAT}/{@link ONLY}). Read once at module load — the launcher
 * sets these before the Playwright spec is collected. Kept in a plain (non-`.eval.ts`) sibling so the eval
 * runner's `*.eval.ts` glob does not collect it as its own spec.
 */
export const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '../../..');
export const fixturesDir = join(repoRoot, 'test-fixtures', 'sites');
export const scenariosDir = join(here, '..', 'scenarios');
export const labelsPath = join(here, '..', 'calibration', 'human-labels.json');
// Launch the app DIRECTORY (Electron resolves the entry via apps/desktop/package.json "main"), NOT the
// built entry file directly. Passing out/main/index.js makes Electron set app.getAppPath() to out/main/,
// so every getAppPath()-relative resource read (the extension catalog, model/typo catalogs, brand icon
// under resources/) resolves against out/main/resources/ — which `electron-vite build` does not populate
// — and the app throws "Failed to read extension catalog" at startup. Launching the dir keeps
// getAppPath() = apps/desktop, so resources/ resolves to the real apps/desktop/resources.
export const appDir = join(repoRoot, 'apps', 'desktop');
export const appEntry = join(appDir, 'out', 'main', 'index.js');

export const MODE = process.env.TEPEGOZ_EVAL_MODE === 'live' ? 'live' : 'scripted';
export const PROVIDER_ID = process.env.TEPEGOZ_EVAL_PROVIDER ?? 'anthropic';
export const API_KEY = process.env.TEPEGOZ_EVAL_API_KEY ?? '';
// Trials per scenario (`TEPEGOZ_EVAL_REPEAT=3`). N=1 is too noisy for a headline — the real agent flips
// pass/fail run-to-run on model sampling — so a defensible number aggregates a per-scenario pass-frequency
// over repeats. Clamped to [1,10]. Default 1 (fast regression / plumbing).
export const REPEAT = Math.min(10, Math.max(1, Math.trunc(Number(process.env.TEPEGOZ_EVAL_REPEAT ?? '1')) || 1));
// Optional comma-separated scenario-id allowlist (`TEPEGOZ_EVAL_ONLY=native_select_country,blog_behind_menu`)
// so an iteration re-runs just the target(s) + a tripwire instead of the whole registry — a full live
// run is minutes-per-scenario under a low-TPM key. Empty → the full registry (baselines / boundaries).
export const ONLY = (process.env.TEPEGOZ_EVAL_ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
/**
 * Per-trial total-token ceiling (`TEPEGOZ_EVAL_RUN_CEILING=120000`). 0/absent = off.
 *
 * `maxSteps` does not bound spend: 25 cheap steps and 25 enormous ones are the same number of steps.
 * The measured worst case in this repo is an `escape_bait` trial that burned 224k tokens flailing into
 * `max_steps` — 4.5x what a trial is budgeted at, spent on the run that learns the least. Over a sweep
 * a handful of those is a material slice of the budget, so a ceiling turns the sweep's cost estimate
 * into a bound rather than a hope. A trial stopped by the ceiling is a REAL failure, not a
 * transport-invalid exclusion: it failed to finish within the budget it was given.
 */
export const RUN_CEILING = Math.max(
  0,
  Math.trunc(Number(process.env.TEPEGOZ_EVAL_RUN_CEILING ?? '0')) || 0,
);
// Optional per-1M-token prices (`TEPEGOZ_EVAL_RATES={"inputPerMillion":2.5,"outputPerMillion":10}`) so
// the report can carry $/run beside tokens. Env-supplied on purpose — vendor prices change, and a stale
// constant baked into the repo would produce confidently wrong money (see `estimateCostUsd`). Untrusted
// input → zod-safe; malformed or absent reads as "not measured", never as $0.
const RatesSchema = z.object({
  inputPerMillion: z.number().nonnegative(),
  outputPerMillion: z.number().nonnegative(),
  // Prompt-cache price multipliers. Optional and un-defaulted on purpose: a cached token costs a
  // fraction of an uncached one, but the fraction is the VENDOR's, not ours to assume. Absent ⇒ 1,
  // which over-reports a cached sweep rather than under-reporting it.
  cacheReadMultiplier: z.number().nonnegative().optional(),
  cacheWriteMultiplier: z.number().nonnegative().optional(),
});
export const RATES: TokenRateUsd | undefined = (() => {
  const raw = process.env.TEPEGOZ_EVAL_RATES;
  if (raw === undefined || raw.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[agent-eval] TEPEGOZ_EVAL_RATES is not valid JSON — cost will read "not measured"');
    return undefined;
  }
  const safe = RatesSchema.safeParse(parsed);
  if (!safe.success) {
    console.warn('[agent-eval] TEPEGOZ_EVAL_RATES shape invalid — cost will read "not measured"');
    return undefined;
  }
  return safe.data;
})();
// The eval window is shown INACTIVE (window.ts) so a batch run never steals focus while the user works —
// but that leaves it in the BACKGROUND, where the user's active window can cover it. A covered/occluded
// window normally STOPS compositing, which breaks render-DOM perception (`document.elementFromPoint`
// returns null → zero actionable elements) and screenshots. These Chromium switches keep the renderer
// painting even when backgrounded/occluded so perception stays reliable. Dev-harness only, never prod.
export const KEEP_RENDERING_WHEN_BACKGROUNDED = [
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];
