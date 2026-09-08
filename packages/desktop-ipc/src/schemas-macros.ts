import { z } from 'zod';

// ── Macros (ext-macros) ────────────────────────────────────────────────────────────────────────
// The macro IR validator (MacroSchema) is owned by @tepegoz/shared-types (the single schema source);
// re-exported here so the main-process IPC handlers validate at the boundary from one import surface.
import { MacroSchema, parseMacro } from '@tepegoz/shared-types';
export { MacroSchema, parseMacro };

export const MacroIdSchema = z.string().min(1).max(128);

/** `macros:run` payload. */
export const MacroRunInputSchema = z.object({
  macroId: MacroIdSchema,
  variables: z.record(z.string().max(64), z.string().max(10_000)).optional(),
});

/** `macros:run-draft` payload — run an UNSAVED macro IR directly (record/edit → play, no persist). */
export const MacroRunDraftSchema = z.object({
  macro: MacroSchema,
  variables: z.record(z.string().max(64), z.string().max(10_000)).optional(),
});

/** `macros:attach-csv` payload — CSV text stored as a content-addressed blob; returns its hash. */
export const MacroAttachCsvSchema = z.object({
  content: z.string().max(10_485_760),
});

/**
 * `macros:import` payload — the raw JSON text of a previously exported macros file. Bounded like any
 * untrusted renderer string; the handler `JSON.parse`s it and validates every entry against
 * {@link MacroSchema} individually. 10 MiB matches the `forEachRow` CSV bound and is far above any
 * real macros export.
 */
export const MacrosImportJsonSchema = z.string().max(10_485_760);
