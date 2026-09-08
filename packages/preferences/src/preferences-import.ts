import { PreferencesPatchSchema, type PreferencesPatch } from './preferences.model';

/**
 * Split a previously exported `preferences.json` into the keys that can be re-applied and the keys
 * that cannot.
 *
 * `preferences.json` holds no secrets — API keys live in the keychain-sealed `credentials.enc.json` —
 * so a plain JSON export is safe to hand the user and safe to read back. "Safe to read back" still
 * means *validated*: the file is untrusted (it may be hand-edited, from an older build, or from a
 * different app entirely), so every key is checked on its own against {@link PreferencesPatchSchema}.
 * A key whose value the schema rejects, or a key the schema does not know, is dropped and named in
 * `skipped` rather than failing the whole import — one stale key should not cost the user the other
 * forty that are fine.
 *
 * A file that is not JSON, or is JSON but not a plain object (an array, `null`, a bare number), is
 * rejected outright with a {@link SyntaxError} — there is nothing to apply and nothing to skip.
 */
export function parsePreferencesImport(json: string): {
  patch: PreferencesPatch;
  skipped: string[];
} {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SyntaxError('Preferences import is not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SyntaxError('Preferences import must be a JSON object.');
  }

  const source = raw as Record<string, unknown>;
  const patch: PreferencesPatch = {};
  const skipped: string[] = [];
  for (const key of Object.keys(source)) {
    // Per-key so one bad value cannot reject the file: `z.object` strips unknown keys, so an
    // unrecognised key parses to `{}` and is caught by the `hasOwnProperty` check below.
    const parsed = PreferencesPatchSchema.safeParse({ [key]: source[key] });
    if (parsed.success && Object.prototype.hasOwnProperty.call(parsed.data, key)) {
      Object.assign(patch, parsed.data);
    } else {
      skipped.push(key);
    }
  }
  return { patch, skipped };
}
