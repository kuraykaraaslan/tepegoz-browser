import { defineExtension } from '@tepegoz/extension-sdk';

export const adblockManifest = defineExtension({
  id: 'com.tepegoz.adblock',
  name: 'Adblock Shield',
  version: '0.1.0',
  description: 'Blocks ads and trackers with per-site controls and cached filter updates.',
  icon: 'shield-halved',
  surfaces: ['popup', 'page'],
  actions: { click: 'popup', doubleClick: 'page' },
  labels: {
    tr: {
      name: 'Reklam Kalkanı',
      description:
        'Reklam ve izleyicileri engeller; site bazlı kontrol ve önbellekli filtre güncellemesi sunar.',
    },
  },
  permissions: ['network', 'tabs'],
});
