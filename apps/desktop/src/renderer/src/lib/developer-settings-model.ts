import { SETTINGS_VISIBILITY, type Preferences } from '@tepegoz/desktop-ipc';

export type EditablePreferenceKey = keyof Preferences;
export type PreferenceValueKind = 'boolean' | 'string' | 'json';
export type PreferenceDraftState = Partial<Record<EditablePreferenceKey, string>>;

export interface DeveloperPreferenceRow {
  key: EditablePreferenceKey;
  value: Preferences[EditablePreferenceKey];
  visibility: 'public' | 'private';
  kind: PreferenceValueKind;
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
    return {
      key: preferenceKey,
      value: value as Preferences[EditablePreferenceKey],
      visibility,
      kind,
      valueText,
      searchText: `${preferenceKey} ${visibility} ${kind} ${valueText}`.toLowerCase(),
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

export function buildStringPreferencePatch(
  key: EditablePreferenceKey,
  value: string,
): Partial<Preferences> {
  return { [key]: value };
}

export function buildJsonPreferencePatch(
  key: EditablePreferenceKey,
  draft: string,
  invalidJsonMessage: string,
): PreferencePatchResult {
  try {
    const parsed: unknown = JSON.parse(draft);
    return { ok: true, patch: { [key]: parsed } };
  } catch {
    return { ok: false, error: invalidJsonMessage };
  }
}
