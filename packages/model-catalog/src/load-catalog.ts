import { CatalogFileSchema, ModelEntrySchema, type ModelEntry } from './catalog.model';

export interface LoadCatalogResult {
  /** Valid, schema-normalized model entries, in file order, deduplicated by id. */
  entries: ModelEntry[];
  /** Human-readable reasons for every entry that was skipped (malformed or a duplicate id). */
  errors: string[];
}

/**
 * Validate a parsed catalog file (a trust boundary — the bytes came off disk). A malformed envelope
 * yields no entries + one error; individual bad entries are dropped without discarding the rest
 * (mirrors `@tepegoz/extension-catalog`).
 */
export function loadCatalog(raw: unknown): LoadCatalogResult {
  const envelope = CatalogFileSchema.safeParse(raw);
  if (!envelope.success) {
    return { entries: [], errors: [`invalid model catalog file: ${envelope.error.message}`] };
  }

  const entries: ModelEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  envelope.data.models.forEach((item, i) => {
    const result = ModelEntrySchema.safeParse(item);
    if (!result.success) {
      errors.push(`models[${i}]: ${result.error.message}`);
      return;
    }
    if (seen.has(result.data.id)) {
      errors.push(`models[${i}]: duplicate model id "${result.data.id}"`);
      return;
    }
    seen.add(result.data.id);
    entries.push(result.data);
  });

  return { entries, errors };
}
