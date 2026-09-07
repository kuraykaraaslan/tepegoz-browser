import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences/model';
import {
  buildBooleanPreferencePatch,
  buildJsonPreferencePatch,
  buildStringPreferencePatch,
  listDeveloperPreferenceRows,
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

  it('builds boolean preference patches', () => {
    expect(buildBooleanPreferencePatch('onboardingCompleted', true)).toEqual({
      onboardingCompleted: true,
    });
  });

  it('builds string preference patches', () => {
    expect(buildStringPreferencePatch('searchEngineId', 'duckduckgo')).toEqual({
      searchEngineId: 'duckduckgo',
    });
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
