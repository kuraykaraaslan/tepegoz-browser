import { defineExtension } from '@tepegoz/extension-sdk';

/** The User-Agent switcher manifest — validated against the SDK schema at module load (dev-time contract). */
export const userAgentManifest = defineExtension({
  id: 'com.tepegoz.user-agent',
  name: 'User-Agent',
  version: '0.1.0',
  description: 'Change how the browser identifies itself to sites — pick a User-Agent from a list.',
  surfaces: ['popup', 'page'],
  actions: { click: 'popup', doubleClick: 'page' },
  labels: {
    tr: {
      name: 'User-Agent',
      description: 'Tarayıcının sitelere kendini nasıl tanıttığını değiştir — listeden bir User-Agent seç.',
    },
  },
  permissions: ['tabs', 'network'],
});
