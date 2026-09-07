import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/**
 * The eval driver's env-derived run knobs. Every value here is read ONCE at module load from an
 * environment a human typed, so each case needs a fresh module graph (`vi.resetModules()` before a
 * dynamic import). What is worth pinning is the CLAMPING and the REFUSALS: a mistyped `REPEAT=abc`
 * must not become `NaN` trials, and a malformed `RATES` must read "not measured" rather than $0 —
 * confidently-wrong money is worse than an absent number.
 */

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./harness-config');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('paths', () => {
  it('launches the app DIRECTORY, not the built entry file (getAppPath must stay apps/desktop)', async () => {
    const { appDir, appEntry, repoRoot, fixturesDir, scenariosDir, labelsPath } = await load({});
    expect(appDir).toBe(join(repoRoot, 'apps', 'desktop'));
    expect(appEntry.startsWith(appDir)).toBe(true);
    expect(appDir.startsWith(repoRoot)).toBe(true);
    expect(fixturesDir.startsWith(repoRoot)).toBe(true);
    expect(scenariosDir).toContain('scenarios');
    expect(labelsPath).toContain('human-labels.json');
  });
});

describe('MODE / PROVIDER_ID / API_KEY', () => {
  it('defaults to the scripted tier — the live tier must be asked for explicitly', async () => {
    const { MODE } = await load({ TEPEGOZ_EVAL_MODE: undefined });
    expect(MODE).toBe('scripted');
  });

  it('treats any value other than the exact string "live" as scripted', async () => {
    const { MODE } = await load({ TEPEGOZ_EVAL_MODE: 'LIVE' });
    expect(MODE).toBe('scripted');
  });

  it('enters the live tier on TEPEGOZ_EVAL_MODE=live', async () => {
    const { MODE } = await load({ TEPEGOZ_EVAL_MODE: 'live' });
    expect(MODE).toBe('live');
  });

  it('defaults the provider to anthropic and the key to empty (never a placeholder)', async () => {
    const { PROVIDER_ID, API_KEY } = await load({
      TEPEGOZ_EVAL_PROVIDER: undefined,
      TEPEGOZ_EVAL_API_KEY: undefined,
    });
    expect(PROVIDER_ID).toBe('anthropic');
    expect(API_KEY).toBe('');
  });

  it('takes the provider and key from the env when supplied', async () => {
    const { PROVIDER_ID, API_KEY } = await load({
      TEPEGOZ_EVAL_PROVIDER: 'openai',
      TEPEGOZ_EVAL_API_KEY: 'sk-test',
    });
    expect(PROVIDER_ID).toBe('openai');
    expect(API_KEY).toBe('sk-test');
  });
});

describe('REPEAT', () => {
  it('defaults to 1 trial per scenario', async () => {
    expect((await load({ TEPEGOZ_EVAL_REPEAT: undefined })).REPEAT).toBe(1);
  });

  it('clamps above 10 — a sweep cannot be talked into an unbounded trial count', async () => {
    expect((await load({ TEPEGOZ_EVAL_REPEAT: '999' })).REPEAT).toBe(10);
  });

  it('clamps 0 and negatives up to 1 — zero trials would report a pass rate over nothing', async () => {
    expect((await load({ TEPEGOZ_EVAL_REPEAT: '0' })).REPEAT).toBe(1);
    expect((await load({ TEPEGOZ_EVAL_REPEAT: '-5' })).REPEAT).toBe(1);
  });

  it('reads a non-numeric value as 1 rather than NaN', async () => {
    expect((await load({ TEPEGOZ_EVAL_REPEAT: 'abc' })).REPEAT).toBe(1);
  });

  it('truncates a fractional count', async () => {
    expect((await load({ TEPEGOZ_EVAL_REPEAT: '3.9' })).REPEAT).toBe(3);
  });
});

describe('ONLY', () => {
  it('is empty (full registry) when unset or blank', async () => {
    expect((await load({ TEPEGOZ_EVAL_ONLY: undefined })).ONLY).toEqual([]);
    expect((await load({ TEPEGOZ_EVAL_ONLY: '  ' })).ONLY).toEqual([]);
  });

  it('splits on commas, trims, and drops empties from a trailing separator', async () => {
    const { ONLY } = await load({ TEPEGOZ_EVAL_ONLY: ' a , b ,, c, ' });
    expect(ONLY).toEqual(['a', 'b', 'c']);
  });
});

describe('RUN_CEILING', () => {
  it('is off (0) when unset', async () => {
    expect((await load({ TEPEGOZ_EVAL_RUN_CEILING: undefined })).RUN_CEILING).toBe(0);
  });

  it('reads a numeric ceiling', async () => {
    expect((await load({ TEPEGOZ_EVAL_RUN_CEILING: '120000' })).RUN_CEILING).toBe(120000);
  });

  it('floors a negative ceiling at 0 (off) rather than passing a nonsense bound to the app', async () => {
    expect((await load({ TEPEGOZ_EVAL_RUN_CEILING: '-1' })).RUN_CEILING).toBe(0);
  });

  it('reads a non-numeric ceiling as off', async () => {
    expect((await load({ TEPEGOZ_EVAL_RUN_CEILING: 'lots' })).RUN_CEILING).toBe(0);
  });
});

describe('RATES (zod boundary — a wrong price is worse than no price)', () => {
  it('is undefined ("not measured") when unset or blank', async () => {
    expect((await load({ TEPEGOZ_EVAL_RATES: undefined })).RATES).toBeUndefined();
    expect((await load({ TEPEGOZ_EVAL_RATES: '   ' })).RATES).toBeUndefined();
  });

  it('accepts a well-formed rate pair', async () => {
    const { RATES } = await load({
      TEPEGOZ_EVAL_RATES: '{"inputPerMillion":2.5,"outputPerMillion":10}',
    });
    expect(RATES).toEqual({ inputPerMillion: 2.5, outputPerMillion: 10 });
  });

  it('carries the optional cache multipliers when the vendor supplied them', async () => {
    const { RATES } = await load({
      TEPEGOZ_EVAL_RATES:
        '{"inputPerMillion":3,"outputPerMillion":15,"cacheReadMultiplier":0.1,"cacheWriteMultiplier":1.25}',
    });
    expect(RATES?.cacheReadMultiplier).toBe(0.1);
    expect(RATES?.cacheWriteMultiplier).toBe(1.25);
  });

  it('warns and reads "not measured" when the value is not valid JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { RATES } = await load({ TEPEGOZ_EVAL_RATES: '{not json' });
    expect(RATES).toBeUndefined();
    expect(warn.mock.calls[0]?.[0]).toContain('not valid JSON');
  });

  it('warns and reads "not measured" when the SHAPE is wrong (missing output price)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { RATES } = await load({ TEPEGOZ_EVAL_RATES: '{"inputPerMillion":2.5}' });
    expect(RATES).toBeUndefined();
    expect(warn.mock.calls[0]?.[0]).toContain('shape invalid');
  });

  it('rejects a NEGATIVE price rather than reporting a negative cost', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { RATES } = await load({
      TEPEGOZ_EVAL_RATES: '{"inputPerMillion":-1,"outputPerMillion":10}',
    });
    expect(RATES).toBeUndefined();
  });
});

describe('KEEP_RENDERING_WHEN_BACKGROUNDED', () => {
  it('disables the occlusion calculation that would stop an inactive eval window compositing', async () => {
    const { KEEP_RENDERING_WHEN_BACKGROUNDED } = await load({});
    expect(KEEP_RENDERING_WHEN_BACKGROUNDED.length).toBeGreaterThan(0);
    expect(KEEP_RENDERING_WHEN_BACKGROUNDED.join(' ')).toContain('CalculateNativeWinOcclusion');
    for (const flag of KEEP_RENDERING_WHEN_BACKGROUNDED) expect(flag.startsWith('--')).toBe(true);
  });
});
