/**
 * The built-in extension registry — the single source of truth for extension IDENTITY (ids, versions,
 * surfaces, localized labels, page routing) in the MAIN process. Deliberately React-free, and MAIN-ONLY:
 * the manifests are not hardcoded here — {@link initBuiltinManifests} is called ONCE at startup (in
 * `main/stores.electron.ts`) with the entries read + validated from the on-disk catalog
 * (`resources/extensions.catalog.json`). Consumers read them at CALL time via {@link builtinManifests} —
 * never at module load — so they always see the initialized set.
 *
 * The renderer does NOT import this module; it receives manifests over IPC (`listExtensionManifests`) and
 * shares only the pure helpers in `./extension-urls`. This module is NOT imported by the sandboxed
 * preload / `ipc-contract.ts` — those must stay dependency-free.
 */
import type { ExtensionManifest } from '@tepegoz/extension-sdk';
import { extensionIdFromPageUrl as idFromPageUrl, extensionPageUrl } from './extension-urls';

export { extensionPageUrl, extensionLabel } from './extension-urls';

let manifests: readonly ExtensionManifest[] | null = null;

/** Populate the built-in manifest registry once, at main-process startup, from the validated on-disk
 *  catalog. Throws on empty input or a second call (both indicate a broken startup sequence). */
export function initBuiltinManifests(entries: readonly ExtensionManifest[]): void {
  if (manifests !== null) throw new Error('built-in manifests already initialized');
  if (entries.length === 0) throw new Error('cannot initialize an empty built-in manifest set');
  manifests = entries;
}

/** Every built-in extension's manifest (from the catalog, populated once at startup). Read at CALL time
 *  so the initialized set is always seen; throws if read before {@link initBuiltinManifests} (a
 *  startup-order bug — the catalog load in `initStores` must run first). */
export function builtinManifests(): readonly ExtensionManifest[] {
  if (manifests === null) throw new Error('built-in manifests read before initialization');
  return manifests;
}

/** The manifest for `id`, or undefined if unknown. */
export function manifestById(id: string): ExtensionManifest | undefined {
  return builtinManifests().find((m) => m.id === id);
}

/** Ids of every built-in that implements a `page` surface. */
function pageIds(): string[] {
  return builtinManifests()
    .filter((m) => m.surfaces.includes('page'))
    .map((m) => m.id);
}

/** Canonical internal-page URLs for every extension that implements a `page` surface. */
export function extensionPageUrls(): string[] {
  return pageIds().map((id) => extensionPageUrl(id));
}

/** The extension id addressed by a `tepegoz://<id>` page URL (trailing slash tolerated), else null.
 *  Only returns ids of extensions that actually declare a `page` surface. */
export function extensionIdFromPageUrl(url: string): string | null {
  return idFromPageUrl(url, pageIds());
}
