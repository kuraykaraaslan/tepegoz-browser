import { readJsonFile, writeJsonFile } from '@tepegoz/json-store';
import { existsSync } from 'node:fs';
import {
  DEFAULT_PREFERENCES,
  PreferencesPatchSchema,
  PreferencesSchema,
  type Preferences,
  type PreferencesPatch,
} from './preferences.model';

/**
 * Persisted app preferences (theme, language, telemetry, cost-saver toggle, default provider).
 * Plain JSON in userData — not secret. The file is treated as untrusted (validated on load); a
 * corrupt/partial file silently falls back to defaults. File path is injected for unit testing.
 */
export default class PreferenceStore {
  private static filePath = '';
  private static prefs: Preferences = { ...DEFAULT_PREFERENCES };

  static init(deps: { filePath: string }): void {
    PreferenceStore.filePath = deps.filePath;
    const fileExists = existsSync(deps.filePath);
    const raw = readJsonFile(deps.filePath);
    const parsed = PreferencesPatchSchema.safeParse(raw);
    const patch: PreferencesPatch = parsed.success ? parsed.data : {};
    // Back-compat: old profiles have a preferences file but no onboarding sentinel. Treat them as
    // already onboarded so an upgrade does not interrupt the user's existing browser session.
    if (fileExists && !hasOwn(raw, 'onboardingCompleted')) patch.onboardingCompleted = true;
    PreferenceStore.prefs = PreferencesSchema.parse({
      ...DEFAULT_PREFERENCES,
      ...patch,
    });
  }

  /** Test seam. */
  static reset(): void {
    PreferenceStore.filePath = '';
    PreferenceStore.prefs = { ...DEFAULT_PREFERENCES };
  }

  static getAll(): Preferences {
    return { ...PreferenceStore.prefs };
  }

  static update(patch: PreferencesPatch): Preferences {
    const validated = PreferencesPatchSchema.parse(patch);
    PreferenceStore.prefs = PreferencesSchema.parse({ ...PreferenceStore.prefs, ...validated });
    writeJsonFile(PreferenceStore.filePath, PreferenceStore.prefs);
    return PreferenceStore.getAll();
  }
}

function hasOwn(value: unknown, key: string): boolean {
  return (
    typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, key)
  );
}
