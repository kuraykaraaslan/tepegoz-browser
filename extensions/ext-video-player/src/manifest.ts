import { defineExtension } from '@tepegoz/extension-sdk';

export const videoPlayerManifest = defineExtension({
  id: 'com.tepegoz.video-player',
  name: 'Unified Player',
  version: '0.1.0',
  description:
    "Replaces every site's native video controls with one consistent player for a unified viewing experience.",
  icon: 'video',
  surfaces: ['popup', 'page'],
  actions: { click: 'popup', doubleClick: 'page' },
  labels: {
    tr: {
      name: 'Birleşik Oynatıcı',
      description:
        'Her sitenin video kontrollerini tek tip bir oynatıcıyla değiştirir; birleşik bir izleme deneyimi sunar.',
    },
  },
  permissions: ['read-page', 'write-page'],
});
