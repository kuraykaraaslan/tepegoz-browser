import { z } from 'zod';

/** Bump when the on-disk catalog file shape changes. */
export const CATALOG_VERSION = 1;

/**
 * One downloadable on-device model (a single-file GGUF). Data-driven — adding/retuning models is a
 * change to `models.catalog.json`, not code (same philosophy as the extension catalog). The one entry
 * with `firstParty:true, recommended:true` is "the browser's own LLM" the UI pre-suggests.
 */
export const ModelEntrySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  /** GGUF download URL. */
  url: z.string().url(),
  sizeBytes: z.number().int().positive(),
  /** Lowercase hex sha256 of the finished file — mandatory integrity check before the model loads. */
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  quant: z.string().max(32),
  /** Recommended context window. */
  ctx: z.number().int().positive(),
  /** Parameter count in billions (memory-fit hint). */
  paramsB: z.number().positive(),
  recommended: z.boolean().default(false),
  firstParty: z.boolean().default(false),
  license: z.string().max(64),
  minRamBytes: z.number().int().positive().optional(),
});
export type ModelEntry = z.infer<typeof ModelEntrySchema>;

/** Outer catalog file envelope (validated atomically; entries validated one-by-one by the loader). */
export const CatalogFileSchema = z.object({
  version: z.literal(CATALOG_VERSION),
  models: z.array(z.unknown()),
});
