import { z } from 'zod';
import { validateManifest, type ExtensionManifest } from '@tepegoz/extension-sdk';
import { CATALOG_VERSION } from './catalog.model';

/** Loose outer shape: the envelope is validated atomically, entries are validated one-by-one below so
 *  a single malformed manifest is skipped-and-reported rather than failing the whole catalog. */
const CatalogEnvelopeSchema = z.object({
  version: z.literal(CATALOG_VERSION),
  extensions: z.array(z.unknown()),
});

export interface LoadCatalogResult {
  /** The valid, schema-normalized manifests, in file order, deduplicated by id. */
  entries: ExtensionManifest[];
  /** Human-readable reasons for every entry that was skipped (malformed or a duplicate id). */
  errors: string[];
}

/**
 * Validate a parsed catalog file (a trust boundary — the bytes came off disk). Returns the good
 * manifests plus a list of skip reasons. A totally malformed file (wrong version / not an object)
 * yields no entries and one error; individual bad entries are dropped without discarding the rest.
 */
export function loadCatalog(raw: unknown): LoadCatalogResult {
  const envelope = CatalogEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return { entries: [], errors: [`invalid catalog file: ${envelope.error.message}`] };
  }

  const entries: ExtensionManifest[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  envelope.data.extensions.forEach((item, i) => {
    const result = validateManifest(item);
    if (!result.success) {
      errors.push(`extensions[${i}]: ${result.error.message}`);
      return;
    }
    if (seen.has(result.data.id)) {
      errors.push(`extensions[${i}]: duplicate extension id "${result.data.id}"`);
      return;
    }
    seen.add(result.data.id);
    entries.push(result.data);
  });

  return { entries, errors };
}
