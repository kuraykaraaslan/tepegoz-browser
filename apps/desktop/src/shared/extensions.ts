/**
 * The built-in extension registry — the single source of truth for extension IDENTITY (ids, versions,
 * surfaces, localized labels, page routing) in the MAIN process. Deliberately React-free. The manifests
 * are no longer hardcoded here: {@link initBuiltinManifests} is called ONCE at startup with the entries
 * read + validated from the on-disk catalog (`resources/extensions.catalog.json`, see
 * `main/stores.electron.ts`). Consumers read them at call time via {@link builtinManifests} — never at
 * module load — so they always see the initialized set.
 *
 * The renderer does NOT import the registry array from here; it receives manifests over IPC
 * (`listExtensionManifests`) and shares only the pure helpers in `./extension-urls`. This module is NOT
 * imported by the sandboxed preload / `ipc-contract.ts` — those must stay dependency-free.
 */
import type { ExtensionManifest } from '@tepegoz/extension-sdk';
import { extensionIdFromPageUrl as idFromPageUrl, extensionPageUrl } from './extension-urls';

// TEMPORARY migration fallback: the built-in manifests as static imports, used ONLY until
// initBuiltinManifests() runs in main. Removed in the final migration step once the renderer moves to
// the IPC-delivered catalog and main always initializes from disk. (Real MV3/third-party extensions
// remain a later phase — untrusted/disk loading is out of scope here.)
import { agentManifest } from '@tepegoz/ext-agent/manifest';
import { userAgentManifest } from '@tepegoz/ext-user-agent/manifest';
import { popupBlockerManifest } from '@tepegoz/ext-popup-blocker/manifest';
import { macrosManifest } from '@tepegoz/ext-macros/manifest';

export { extensionPageUrl, extensionLabel } from './extension-urls';

const FALLBACK_MANIFESTS: readonly ExtensionManifest[] = [
  agentManifest,
  userAgentManifest,
  popupBlockerManifest,
  macrosManifest,
];

let manifests: readonly ExtensionManifest[] | null = null;

/** Populate the built-in manifest registry once, at main-process startup, from the validated on-disk
 *  catalog. Throws on empty input or a second call (both indicate a broken startup sequence). */
export function initBuiltinManifests(entries: readonly ExtensionManifest[]): void {
  if (manifests !== null) throw new Error('built-in manifests already initialized');
  if (entries.length === 0) throw new Error('cannot initialize an empty built-in manifest set');
  manifests = entries;
}

/** Every built-in extension's manifest — the catalog set once initialized, the static fallback until
 *  then (renderer / pre-init reads). Read at CALL time so the initialized set is always seen. */
export function builtinManifests(): readonly ExtensionManifest[] {
  return manifests ?? FALLBACK_MANIFESTS;
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
