import { defineExtension } from '@tepegoz/extension-sdk';

export const translateManifest = defineExtension({
  id: 'com.tepegoz.translate',
  name: 'Translate',
  version: '0.1.0',
  description: 'Local-first full-page and selection translation with restoreable page rewrites.',
  icon: 'language',
  surfaces: ['popup', 'page'],
  actions: { click: 'popup', doubleClick: 'page' },
  labels: {
    tr: {
      name: 'Çeviri',
      description: 'Geri alınabilir tam sayfa ve seçili metin çevirisi.',
    },
  },
  permissions: ['read-page', 'write-page', 'network'],
});
