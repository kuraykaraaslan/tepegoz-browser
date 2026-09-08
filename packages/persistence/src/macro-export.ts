import { parseMacro, type Macro } from '@tepegoz/shared-types';

/**
 * Serialize + parse the user's saved macros for a user-initiated backup.
 *
 * JSON, not a "portable" format: unlike bookmarks (Netscape HTML) or history (CSV for a spreadsheet),
 * there is no cross-tool macro interchange format to target — a macro is this app's own deterministic
 * IR. But unlike history, a macro IS meaningfully re-usable, so the export round-trips: {@link
 * parseMacrosImport} reads the file back, validates every entry on its own, and upserts the ones that
 * pass. Macros carry no secrets (a macro is a recorded click/type script; CSV attachments are
 * content-addressed blob refs, not the data), so the plain JSON is safe to move between machines.
 */

/** Marker on the export envelope so an import can tell a macros file from an arbitrary JSON blob. */
export const MACROS_EXPORT_FORMAT = 'tepegoz.macros';
/** Envelope schema version — bumped only if the *file wrapper* changes, not the macro IR. */
export const MACROS_EXPORT_VERSION = 1;

export interface MacrosExportFile {
  format: typeof MACROS_EXPORT_FORMAT;
  version: number;
  macros: Macro[];
}

/** The whole macro set as one pretty-printed JSON document (stable key order, newline-terminated). */
export function serializeMacrosJson(macros: readonly Macro[]): string {
  const file: MacrosExportFile = {
    format: MACROS_EXPORT_FORMAT,
    version: MACROS_EXPORT_VERSION,
    macros: [...macros],
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Split a previously exported macros file into the entries that can be re-applied and a count of the
 * ones that cannot.
 *
 * The file is untrusted (hand-edited, from an older build, or not a macros file at all), so every
 * entry is checked on its own against {@link parseMacro}. An entry the schema rejects is dropped and
 * counted in `skipped` rather than failing the whole import — one bad macro should not cost the user
 * the other forty that are fine.
 *
 * Accepts either the `{ format, version, macros }` envelope this app writes or a bare JSON array of
 * macros (so a hand-assembled list still imports). A file that is not JSON, or is JSON with no macro
 * list at all, is rejected outright with a {@link SyntaxError} — there is nothing to apply.
 */
export function parseMacrosImport(json: string): { macros: Macro[]; skipped: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SyntaxError('Macros import is not valid JSON.');
  }

  let list: unknown;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'object' && raw !== null && Array.isArray((raw as MacrosExportFile).macros)) {
    list = (raw as MacrosExportFile).macros;
  } else {
    throw new SyntaxError('Macros import must be a JSON array or an export file with a "macros" array.');
  }

  const macros: Macro[] = [];
  let skipped = 0;
  for (const entry of list as unknown[]) {
    const parsed = parseMacro(entry);
    if (parsed.success) macros.push(parsed.data);
    else skipped += 1;
  }
  return { macros, skipped };
}
