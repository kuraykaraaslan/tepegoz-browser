/**
 * The built-in extension registry — the single source of truth for extension IDENTITY (ids, versions,
 * surfaces, localized labels, page routing). Deliberately React-free and side-effect-free so BOTH the
 * main process (native menus, internal-tab titles, `tepegoz://` routing) and the renderer can import
 * it. The renderer pairs each manifest here with its surface components (see `extensions/registry.tsx`).
 *
 * NOT imported by the sandboxed preload / `ipc-contract.ts` — those must stay dependency-free, and the
 * manifests pull in zod via `@tepegoz/extension-sdk`.
 */
import type { ExtensionManifest } from '@tepegoz/extension-sdk';
import { agentManifest } from '@tepegoz/ext-agent/manifest';
import { userAgentManifest } from '@tepegoz/ext-user-agent/manifest';

/** Every built-in extension's manifest. Add new built-ins here (and their components in the renderer
 *  registry). Real MV3/third-party extensions are a later phase. */
export const BUILTIN_MANIFESTS: readonly ExtensionManifest[] = [agentManifest, userAgentManifest];

/** All built-in extension ids (reverse-DNS), for iteration in menus etc. */
export const EXTENSION_IDS: readonly string[] = BUILTIN_MANIFESTS.map((m) => m.id);

/** The manifest for `id`, or undefined if unknown. */
export function manifestById(id: string): ExtensionManifest | undefined {
  return BUILTIN_MANIFESTS.find((m) => m.id === id);
}

/** An extension's display name + description for `locale`, falling back to the manifest defaults. */
export function extensionLabel(
  m: ExtensionManifest,
  locale: string,
): { name: string; description: string } {
  const override = m.labels[locale];
  return {
    name: override?.name ?? m.name,
    description: override?.description ?? m.description,
  };
}

/** The internal-page URL for an extension that declares a `page` surface (`tepegoz://<id>`). */
export function extensionPageUrl(id: string): string {
  return `tepegoz://${id}`;
}

/** Canonical internal-page URLs for every extension that implements a `page` surface. */
export const EXTENSION_PAGE_URLS: readonly string[] = BUILTIN_MANIFESTS.filter((m) =>
  m.surfaces.includes('page'),
).map((m) => extensionPageUrl(m.id));

/** The extension id addressed by a `tepegoz://<id>` page URL (trailing slash tolerated), else null.
 *  Only returns ids of extensions that actually declare a `page` surface. */
export function extensionIdFromPageUrl(url: string): string | null {
  const canonical = url.trim().toLowerCase().replace(/\/+$/, '');
  const match = BUILTIN_MANIFESTS.find(
    (m) => m.surfaces.includes('page') && extensionPageUrl(m.id) === canonical,
  );
  return match?.id ?? null;
}
