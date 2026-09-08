import type { z } from 'zod';
import { SETTINGS_VISIBILITY, type Preferences } from '@tepegoz/desktop-ipc';
import { preferenceMeta, type PreferenceStability } from '@tepegoz/preferences/developer-registry';
import { PreferencesSchema } from '@tepegoz/preferences/model';

export type EditablePreferenceKey = keyof Preferences;
export type PreferenceValueKind = 'boolean' | 'string' | 'json';
export type PreferenceDraftState = Partial<Record<EditablePreferenceKey, string>>;

export interface DeveloperPreferenceRow {
  key: EditablePreferenceKey;
  value: Preferences[EditablePreferenceKey];
  visibility: 'public' | 'private';
  kind: PreferenceValueKind;
  stability: PreferenceStability;
  restartRequired: boolean;
  valueText: string;
  searchText: string;
}

export type PreferencePatchResult =
  { ok: true; patch: Partial<Preferences> } | { ok: false; error: string };

export function listDeveloperPreferenceRows(prefs: Preferences): DeveloperPreferenceRow[] {
  return Object.entries(prefs).map(([key, value]) => {
    const preferenceKey = key as EditablePreferenceKey;
    const visibility = SETTINGS_VISIBILITY[preferenceKey] ?? 'private';
    const kind = preferenceValueKind(value);
    const valueText = preferenceValueText(value, kind);
    const { stability, restartRequired } = preferenceMeta(preferenceKey);
    return {
      key: preferenceKey,
      value: value as Preferences[EditablePreferenceKey],
      visibility,
      kind,
      stability,
      restartRequired,
      valueText,
      searchText: `${preferenceKey} ${visibility} ${kind} ${stability} ${valueText}`.toLowerCase(),
    };
  });
}

export function preferenceValueKind(value: unknown): PreferenceValueKind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return 'json';
}

export function preferenceValueText(value: unknown, kind = preferenceValueKind(value)): string {
  if (kind === 'string') return String(value);
  if (kind === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(value, null, 2);
}

export function buildBooleanPreferencePatch(
  key: EditablePreferenceKey,
  value: boolean,
): Partial<Preferences> {
  return { [key]: value };
}

/**
 * Check one edited value against the SAME zod field the preferences schema enforces, so the editor
 * rejects a bad enum / over-length string / malformed URL up front instead of round-tripping to the
 * IPC boundary and surfacing its raw rejection. An unknown key (one not in the schema) passes here and
 * is left for the boundary to reject — the editor never invents a key.
 */
export function validatePreferenceValue(
  key: EditablePreferenceKey,
  value: unknown,
): { ok: true } | { ok: false; error: string } {
  const field: z.ZodTypeAny | undefined = (
    PreferencesSchema.shape as Record<string, z.ZodTypeAny>
  )[key];
  if (field === undefined) return { ok: true };
  const result = field.safeParse(value);
  if (result.success) return { ok: true };
  const issue = result.error.issues[0];
  const path = issue?.path.join('.') ?? '';
  const message = issue?.message ?? 'Invalid value';
  return { ok: false, error: path.length > 0 ? `${path}: ${message}` : message };
}

export function buildStringPreferencePatch(
  key: EditablePreferenceKey,
  value: string,
): PreferencePatchResult {
  const check = validatePreferenceValue(key, value);
  if (!check.ok) return check;
  return { ok: true, patch: { [key]: value } };
}

export function buildJsonPreferencePatch(
  key: EditablePreferenceKey,
  draft: string,
  invalidJsonMessage: string,
): PreferencePatchResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft);
  } catch {
    return { ok: false, error: invalidJsonMessage };
  }
  const check = validatePreferenceValue(key, parsed);
  if (!check.ok) return check;
  return { ok: true, patch: { [key]: parsed } };
}
