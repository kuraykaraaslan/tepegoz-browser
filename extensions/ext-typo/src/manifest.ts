import { defineExtension } from '@tepegoz/extension-sdk';

export const typoManifest = defineExtension({
  id: 'com.tepegoz.typo',
  name: 'Typo',
  version: '0.1.0',
  description: 'Local-first spelling and writing suggestions for editable text.',
  icon: 'wand-magic-sparkles',
  surfaces: ['popup', 'page'],
  actions: { click: 'popup', doubleClick: 'page' },
  labels: {
    tr: {
      name: 'Yazım',
      description: 'Editable metinler için cihaz-öncelikli yazım önerileri.',
    },
  },
  permissions: ['read-page'],
});
