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

/** A plain `{ ... }` object (not an array, not null) — the shape the field-level editor can drill into. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The leaf entries of a nested-object preference that the field editor renders as individual controls.
 * A nested object / array / null value is left out — those stay in the raw-JSON editor rather than
 * getting a half-editor that can only show them.
 */
export type EditableLeafKind = 'boolean' | 'number' | 'string';

export interface EditableLeaf {
  key: string;
  kind: EditableLeafKind;
  value: boolean | number | string;
}

export function editableLeaves(obj: Record<string, unknown>): EditableLeaf[] {
  const leaves: EditableLeaf[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'boolean') leaves.push({ key, kind: 'boolean', value });
    else if (typeof value === 'number') leaves.push({ key, kind: 'number', value });
    else if (typeof value === 'string') leaves.push({ key, kind: 'string', value });
  }
  return leaves;
}

/** Return a copy of `obj` with `key` set to `value` — the field editor's one mutation. */
export function withLeaf(
  obj: Record<string, unknown>,
  key: string,
  value: boolean | number | string,
): Record<string, unknown> {
  return { ...obj, [key]: value };
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
