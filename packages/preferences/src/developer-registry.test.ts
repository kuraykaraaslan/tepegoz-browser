import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from './preferences.model';
import { PREFERENCE_METADATA, preferenceMeta, type PreferenceStability } from './developer-registry';

/**
 * `DEFAULT_PREFERENCES` is a complete `Preferences` (typed as one), so it is the honest key list to
 * check the registry against. The `satisfies` in the registry already makes a MISSING classification a
 * compile error; this pins the reverse — a stale row for a preference that has since been removed —
 * and the semantic invariants a type cannot state.
 */
const PREF_KEYS = Object.keys(DEFAULT_PREFERENCES).sort();
const VALID_STABILITY: readonly PreferenceStability[] = ['stable', 'experimental', 'internal'];

describe('developer preference registry', () => {
  it('classifies exactly the top-level preference keys — no more, no less', () => {
    expect(Object.keys(PREFERENCE_METADATA).sort()).toEqual(PREF_KEYS);
  });

  it('gives every key a valid stability', () => {
    for (const [key, meta] of Object.entries(PREFERENCE_METADATA)) {
      expect(VALID_STABILITY, `${key} stability`).toContain(meta.stability);
    }
  });

  it('only marks restart-required on keys that are read at startup', () => {
    const restart = Object.entries(PREFERENCE_METADATA)
      .filter(([, meta]) => meta.restartRequired)
      .map(([key]) => key)
      .sort();
    // These are the three the schema itself documents as startup-only. If this list changes, the
    // change is deliberate and the schema comment on that key should say so too.
    expect(restart).toEqual(['chromiumFlags', 'crashReportingEnabled', 'hardwareAccelerationEnabled']);
  });

  it('every restart-required key is a real preference', () => {
    for (const [key, meta] of Object.entries(PREFERENCE_METADATA)) {
      if (meta.restartRequired) expect(PREF_KEYS).toContain(key);
    }
  });

  it('falls back to stable / no-restart for an unclassified key', () => {
    const meta = preferenceMeta('somethingBrandNew' as keyof typeof DEFAULT_PREFERENCES);
    expect(meta).toEqual({ stability: 'stable', restartRequired: false });
  });

  it('resolves a known key to its row', () => {
    expect(preferenceMeta('chromiumFlags')).toEqual({
      stability: 'stable',
      restartRequired: true,
    });
    expect(preferenceMeta('onboardingCompleted').stability).toBe('internal');
    expect(preferenceMeta('localProvider').stability).toBe('experimental');
  });
});
