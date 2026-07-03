import { z } from 'zod';
import { ExtensionManifestSchema } from '@tepegoz/extension-sdk';

/**
 * The versioned, on-disk catalog of built-in extension manifests. This is the single source of
 * extension IDENTITY at runtime: the desktop app generates `extensions.catalog.json` at build time
 * (from each extension's authored manifest) and the main process reads + validates it at startup,
 * rather than importing a hardcoded array. Bumping {@link CATALOG_VERSION} lets an older reader reject
 * a newer file shape instead of silently mis-parsing it.
 */
export const CATALOG_VERSION = 1;

/**
 * The atomic catalog schema — every entry must be a valid {@link ExtensionManifestSchema}. Used by the
 * GENERATOR to fail the build on a bad manifest. The runtime READER ({@link loadCatalog}) instead
 * validates entries one-by-one so a single corrupt entry is skipped rather than dropping the catalog.
 */
export const CatalogFileSchema = z.object({
  version: z.literal(CATALOG_VERSION),
  extensions: z.array(ExtensionManifestSchema),
});
export type CatalogFile = z.infer<typeof CatalogFileSchema>;
