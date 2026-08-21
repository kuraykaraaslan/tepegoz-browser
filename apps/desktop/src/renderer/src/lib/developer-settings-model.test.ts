import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences/model';
import {
  buildBooleanPreferencePatch,
  buildJsonPreferencePatch,
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
});
