/**
 * Pure, array-INDEPENDENT extension helpers — no module state, no manifest registry. Split out from
 * `shared/extensions.ts` so BOTH the main process (which holds the runtime-loaded catalog) and the
 * renderer (which receives manifests over IPC) can share the exact URL/label logic without importing
 * the stateful registry. React-free and zod-free.
 */
import type { ExtensionManifest } from '@tepegoz/extension-sdk';

/** The internal-page URL for an extension that declares a `page` surface (`tepegoz://<id>`). */
export function extensionPageUrl(id: string): string {
  return `tepegoz://${id}`;
}

/** An extension's display name + description for `locale`, falling back to the manifest defaults.
 *  Accepts any manifest-shaped value (the SDK type or the IPC wire type) via a structural `Pick`. */
export function extensionLabel(
  m: Pick<ExtensionManifest, 'name' | 'description' | 'labels'>,
  locale: string,
): { name: string; description: string } {
  const override = m.labels[locale];
  return {
    name: override?.name ?? m.name,
    description: override?.description ?? m.description,
  };
}

/** The extension id addressed by a `tepegoz://<id>` page URL (trailing slash tolerated), else null.
 *  `pageIds` must be the ids of extensions that actually declare a `page` surface. */
export function extensionIdFromPageUrl(url: string, pageIds: readonly string[]): string | null {
  const canonical = url.trim().toLowerCase().replace(/\/+$/, '');
  return pageIds.find((id) => extensionPageUrl(id) === canonical) ?? null;
}
