import { readJsonFile, writeJsonFile } from '../lib/json-store';
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
    const parsed = PreferencesPatchSchema.safeParse(readJsonFile(deps.filePath));
    PreferenceStore.prefs = PreferencesSchema.parse({
      ...DEFAULT_PREFERENCES,
      ...(parsed.success ? parsed.data : {}),
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
