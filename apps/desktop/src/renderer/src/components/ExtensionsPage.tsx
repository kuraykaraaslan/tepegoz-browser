import { ExtensionsGrid, type ExtensionCardItem } from '@tepegoz/extensions-ui';
import type { Locale } from '@tepegoz/i18n';
import {
  isExtensionEnabled,
  type ExtensionId,
  type ExtensionState,
} from '@tepegoz/desktop-ipc';
import { extensionLabel } from '../../../shared/extension-urls';
import type { ExtensionDef } from '../extensions/registry';

/**
 * Internal extensions manager (tepegoz://extensions): maps the built-in extension registry (with each
 * manifest's localized labels + enabled state) into the generic `@tepegoz/extensions-ui` grid. The
 * registry is passed in (built from the IPC-delivered catalog). Real MV3/third-party extensions are a
 * later phase.
 */
interface ExtensionsPageProps {
  locale: Locale;
  extensions: readonly ExtensionDef[];
  states: readonly ExtensionState[];
  onToggle: (id: ExtensionId, enabled: boolean) => void;
}

export function ExtensionsPage({ locale, extensions, states, onToggle }: ExtensionsPageProps) {
  const items: ExtensionCardItem[] = extensions.map((ext) => {
    const label = extensionLabel(ext.manifest, locale);
    return {
      id: ext.id,
      icon: ext.icon,
      name: label.name,
      description: label.description,
      meta: `v${ext.manifest.version} · ${ext.manifest.id}`,
      enabled: isExtensionEnabled(states, ext.id),
    };
  });

  return <ExtensionsGrid items={items} onToggle={onToggle} />;
}
