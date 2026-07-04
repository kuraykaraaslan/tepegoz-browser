import { useEffect, useState } from 'react';
import { buildExtensionRegistry, type ExtensionDef } from './registry';

/**
 * Fetch the built-in extension catalog once over IPC and build the renderer registry (manifest + lazy
 * surfaces + icon). Returns an empty registry until it resolves — callers tolerate `[]` the same way
 * they tolerate `prefs === null`. Every render entry point (the main App and each standalone popup
 * window, which have separate React roots) reuses this so none hardcodes the extension list.
 */
export function useExtensionCatalog(): { registry: ExtensionDef[]; ready: boolean } {
  const [registry, setRegistry] = useState<ExtensionDef[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    window.tepegoz
      .listExtensionManifests()
      .then((manifests) => {
        if (alive) setRegistry(buildExtensionRegistry(manifests));
      })
      .catch(() => {
        /* bridge unavailable — leave an empty registry; the chrome still renders */
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { registry, ready };
}
