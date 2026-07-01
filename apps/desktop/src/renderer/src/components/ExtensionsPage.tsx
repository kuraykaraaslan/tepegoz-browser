import { ExtensionsGrid, type ExtensionCardItem } from '@tepegoz/extensions-ui';
import type { Locale } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import {
  isExtensionEnabled,
  type ExtensionId,
  type ExtensionState,
} from '@tepegoz/desktop-ipc';
import { extensionsDict } from '../../../i18n';
import { extensionLabel } from '../../../shared/extensions';
import { EXTENSIONS } from '../extensions/registry';

/**
 * Internal extensions manager (tepegoz://extensions): maps the built-in extension registry (with each
 * manifest's localized labels + enabled state) into the generic `@tepegoz/extensions-ui` grid. Real
 * MV3/third-party extensions are a later phase.
 */
interface ExtensionsPageProps {
  locale: Locale;
  states: readonly ExtensionState[];
  onToggle: (id: ExtensionId, enabled: boolean) => void;
}

export function ExtensionsPage({ locale, states, onToggle }: ExtensionsPageProps) {
  const x = useT(extensionsDict);
  const items: ExtensionCardItem[] = EXTENSIONS.map((ext) => {
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

  return (
    <ExtensionsGrid
      labels={{ title: x.title, search: x.search, empty: x.empty }}
      items={items}
      onToggle={onToggle}
    />
  );
}
