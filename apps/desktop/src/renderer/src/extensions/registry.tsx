import { lazy, type ComponentType, type ReactNode } from 'react';
import type { ExtensionSurfaceKind } from '@tepegoz/extension-sdk';
import type { ExtensionManifestWire } from '@tepegoz/desktop-ipc';
import { iconNodeFor } from './icon-registry';
import { SURFACE_LOADERS, type SurfaceLoader } from './surface-loaders';

/**
 * Renderer registry of built-in extensions, built at runtime from the IPC-delivered catalog (identity)
 * paired with lazily-loaded surface components (see {@link SURFACE_LOADERS}) and a data-driven icon
 * (from the manifest's `icon` slug). No hardcoded manifest array lives here anymore; each surface is a
 * `React.lazy` component code-split into its own chunk, loaded only when the surface first renders
 * (wrap render sites in `<Suspense>`). A surface receives the host API indirectly — the loader binds
 * `window.tepegoz` — so the extension package never reaches the global bridge itself.
 */
export interface ExtensionSurfaceProps {
  onClose: () => void;
}

export interface ExtensionDef {
  id: string;
  manifest: ExtensionManifestWire;
  icon: ReactNode;
  /** Lazy renderers for the surfaces this extension implements (a subset of `manifest.surfaces` — a
   *  declared surface with no registered loader is skipped). */
  surfaces: Partial<Record<ExtensionSurfaceKind, ComponentType<ExtensionSurfaceProps>>>;
}

/** Wrap a surface loader thunk as a `React.lazy` component (needs a `{ default }` module shape). */
function lazySurface(loader: SurfaceLoader): ComponentType<ExtensionSurfaceProps> {
  return lazy(() => loader().then((component) => ({ default: component })));
}

/** Build the renderer registry from the catalog manifests: pair each with its lazy surfaces + icon. */
export function buildExtensionRegistry(
  manifests: readonly ExtensionManifestWire[],
): ExtensionDef[] {
  return manifests.map((manifest) => {
    const loaders = SURFACE_LOADERS[manifest.id] ?? {};
    const surfaces: Partial<Record<ExtensionSurfaceKind, ComponentType<ExtensionSurfaceProps>>> = {};
    for (const kind of manifest.surfaces) {
      const loader = loaders[kind];
      if (loader !== undefined) surfaces[kind] = lazySurface(loader);
    }
    return { id: manifest.id, manifest, icon: iconNodeFor(manifest.icon), surfaces };
  });
}

/** The registry entry for `id`, or undefined. */
export function extensionDefById(
  registry: readonly ExtensionDef[],
  id: string,
): ExtensionDef | undefined {
  return registry.find((ext) => ext.id === id);
}
