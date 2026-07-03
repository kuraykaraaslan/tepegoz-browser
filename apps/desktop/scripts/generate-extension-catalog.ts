/**
 * Build step: emit `resources/extensions.catalog.json` from each built-in extension's authored
 * manifest. The main process reads + zod-validates this file at startup (see `stores.electron.ts`)
 * instead of importing a hardcoded manifest array. Run via `vite-node` (it resolves the workspace TS
 * per-extension manifest modules); wired into the desktop `dev`/`build` scripts so the artifact is
 * always fresh. Adding a first-party built-in touches exactly this list plus the renderer
 * surface-loader thunk map — all other extension wiring is data-driven off the catalog.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { agentManifest } from '@tepegoz/ext-agent/manifest';
import { userAgentManifest } from '@tepegoz/ext-user-agent/manifest';
import { popupBlockerManifest } from '@tepegoz/ext-popup-blocker/manifest';
import { macrosManifest } from '@tepegoz/ext-macros/manifest';
import { CATALOG_VERSION, CatalogFileSchema } from '@tepegoz/extension-catalog';

const BUILTIN_MANIFESTS = [agentManifest, userAgentManifest, popupBlockerManifest, macrosManifest];

// Validate atomically at generation time: a bad manifest must fail the build, not ship a broken file.
const catalog = CatalogFileSchema.parse({ version: CATALOG_VERSION, extensions: BUILTIN_MANIFESTS });

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'resources',
  'extensions.catalog.json',
);
writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
// eslint-disable-next-line no-console
console.log(`[extension-catalog] wrote ${catalog.extensions.length} manifests → ${outPath}`);
