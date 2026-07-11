import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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
