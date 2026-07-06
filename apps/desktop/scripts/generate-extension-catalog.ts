/**
 * Build step: emit `resources/extensions.catalog.json` by SCANNING the `extensions/` folder — every
 * `extensions/<pkg>/src/manifest.ts` whose module exports a valid manifest is included. Dropping an
 * extension folder in makes it load; removing one makes it disappear — no code change here or a
 * hardcoded array (the old `BUILTIN_MANIFESTS`). The main process reads + zod-validates this file at
 * startup (see `stores.electron.ts`) instead of importing manifests directly. Run via `vite-node` (it
 * resolves the workspace TS manifest modules); wired into the desktop `dev`/`build` scripts so the
 * artifact is always fresh.
 *
 * NOTE (the honest limit): the RENDERER's surface-loader thunk map (`surface-loaders.tsx`) still needs
 * static `import()` specifiers per extension for the bundler to code-split — it's a static superset,
 * consulted only for extensions actually present in this catalog, so a stale thunk for a removed
 * extension is inert. Extension IDENTITY/registration is fully dynamic; only code-loading is static.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { validateManifest, type ExtensionManifest } from '@tepegoz/extension-sdk';
import { CATALOG_VERSION, CatalogFileSchema } from '@tepegoz/extension-catalog';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..', '..', '..');
const extensionsDir = join(repoRoot, 'extensions');

/** Pull the (single) valid `ExtensionManifest` a manifest module exports, or null if none qualifies. */
function manifestFromModule(mod: Record<string, unknown>): ExtensionManifest | null {
  for (const value of Object.values(mod)) {
    const parsed = validateManifest(value);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** Every `extensions/<pkg>` directory that ships a `src/manifest.ts`. */
function extensionManifestFiles(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(extensionsDir);
  } catch {
    return []; // no extensions/ folder → an empty (but still valid) catalog
  }
  return entries
    .map((name) => join(extensionsDir, name, 'src', 'manifest.ts'))
    .filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    });
}

const manifests: ExtensionManifest[] = [];
for (const file of extensionManifestFiles()) {
  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  const manifest = manifestFromModule(mod);
  if (manifest === null) {
    // eslint-disable-next-line no-console
    console.warn(`[extension-catalog] skipped ${file}: no valid manifest export`);
    continue;
  }
  manifests.push(manifest);
}
// Deterministic order (by id) so the generated file doesn't churn with directory-listing order.
manifests.sort((a, b) => a.id.localeCompare(b.id));

// Validate atomically at generation time: a bad set must fail the build, not ship a broken file.
const catalog = CatalogFileSchema.parse({ version: CATALOG_VERSION, extensions: manifests });

const outPath = join(scriptDir, '..', 'resources', 'extensions.catalog.json');
writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
// eslint-disable-next-line no-console
console.log(`[extension-catalog] wrote ${catalog.extensions.length} manifests → ${outPath}`);
