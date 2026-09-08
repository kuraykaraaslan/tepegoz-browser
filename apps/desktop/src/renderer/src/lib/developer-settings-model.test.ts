import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences/model';
import {
  buildBooleanPreferencePatch,
  buildJsonPreferencePatch,
  buildStringPreferencePatch,
  editableLeaves,
  isPlainObject,
  listDeveloperPreferenceRows,
  validatePreferenceValue,
  withLeaf,
} from './developer-settings-model';

/**
 * The defaults ARE a complete `Preferences` (the constant is typed as one), so deriving the fixture
 * from them keeps this test honest for free. The previous hand-written literal had to be extended by
 * hand for every new preference and silently broke `tsc` twice when it was not.
 */
const PREFS = DEFAULT_PREFERENCES;

describe('developer settings model', () => {
  it('lists every top-level preference key without pseudo flags', () => {
    const keys = listDeveloperPreferenceRows(PREFS)
      .map((row) => row.key)
      .sort();

    expect(keys).toEqual(Object.keys(PREFS).sort());
    expect(keys).not.toContain('developerFlags');
  });

  it('carries each row its registry stability + restart flag, and indexes stability for search', () => {
    const rows = listDeveloperPreferenceRows(PREFS);
    const flags = rows.find((r) => r.key === 'chromiumFlags');
    expect(flags?.stability).toBe('stable');
    expect(flags?.restartRequired).toBe(true);
    expect(flags?.searchText).toContain('stable');

    const localProvider = rows.find((r) => r.key === 'localProvider');
    expect(localProvider?.stability).toBe('experimental');
    expect(localProvider?.searchText).toContain('experimental');

    const onboarding = rows.find((r) => r.key === 'onboardingCompleted');
    expect(onboarding?.stability).toBe('internal');
    expect(onboarding?.restartRequired).toBe(false);
  });

  it('builds boolean preference patches', () => {
    expect(buildBooleanPreferencePatch('onboardingCompleted', true)).toEqual({
      onboardingCompleted: true,
    });
  });

  it('builds string preference patches for a schema-valid value', () => {
    expect(buildStringPreferencePatch('searchEngineId', 'duckduckgo')).toEqual({
      ok: true,
      patch: { searchEngineId: 'duckduckgo' },
    });
  });

  it('rejects a string value the preferences schema would reject, before the IPC round-trip', () => {
    // `theme` is a z.enum — the old builder handed 'neon' straight to updatePreferences and let the
    // boundary bounce it back as a raw zod error.
    const result = buildStringPreferencePatch('theme', 'neon');
    expect(result.ok).toBe(false);
  });

  it('builds JSON preference patches from valid JSON', () => {
    expect(buildJsonPreferencePatch('mcpServers', '[]', 'Invalid JSON')).toEqual({
      ok: true,
      patch: { mcpServers: [] },
    });
  });

  it('rejects invalid JSON drafts', () => {
    expect(buildJsonPreferencePatch('mcpServers', '[', 'Invalid JSON')).toEqual({
      ok: false,
      error: 'Invalid JSON',
    });
  });

  it('rejects well-formed JSON whose value fails the schema', () => {
    // parses fine as JSON; `agentTokenQuota` is z.number().int().min(0), so -5 must not get through.
    const result = buildJsonPreferencePatch('agentTokenQuota', '-5', 'Invalid JSON');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('passes an unknown key through — the editor never invents a key, the boundary rejects it', () => {
    expect(validatePreferenceValue('notARealPreference' as never, 'x')).toEqual({ ok: true });
  });

  it('isPlainObject accepts {} but not arrays or null', () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });

  it('editableLeaves keeps scalar props and drops nested objects / arrays / null', () => {
    const leaves = editableLeaves({
      enabled: true,
      count: 3,
      mode: 'ads',
      disabledOrigins: [],
      nested: { x: 1 },
      missing: null,
    });
    expect(leaves).toEqual([
      { key: 'enabled', kind: 'boolean', value: true },
      { key: 'count', kind: 'number', value: 3 },
      { key: 'mode', kind: 'string', value: 'ads' },
    ]);
  });

  it('withLeaf replaces one key and leaves the rest (and the input) untouched', () => {
    const input = { enabled: true, mode: 'ads' };
    expect(withLeaf(input, 'enabled', false)).toEqual({ enabled: false, mode: 'ads' });
    expect(input.enabled).toBe(true);
  });

  it('classifies a preference with no visibility entry as private, not public', () => {
    // `SETTINGS_VISIBILITY` is maintained by hand, so a preference can land in the model before
    // anyone classifies it. That gap has to fail CLOSED: reading as public would put a brand-new
    // preference in front of `tepegoz://` pages through the public-settings surface before anyone
    // decided it should be readable at all. Every key in DEFAULT_PREFERENCES is classified today,
    // which is exactly why this fallback needs a test of its own.
    const rows = listDeveloperPreferenceRows({
      ...PREFS,
      brandNewUnclassifiedPreference: 'x',
    } as unknown as typeof PREFS);

    const row = rows.find((r) => (r.key as string) === 'brandNewUnclassifiedPreference');
    expect(row?.visibility).toBe('private');
    // and it is findable by that word, since the search index carries the classification
    expect(row?.searchText).toContain('private');
  });
});
