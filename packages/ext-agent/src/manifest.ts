import { defineExtension } from '@tepegoz/extension-sdk';

/** The Agent extension manifest — validated against the SDK schema at module load (dev-time contract). */
export const agentManifest = defineExtension({
  id: 'com.tepegoz.agent',
  name: 'Agent',
  version: '0.1.0',
  description: 'Autonomous browsing tasks on the current page, with human approval.',
  surfaces: ['sidebar'],
  actions: { click: 'sidebar' },
  labels: {
    tr: {
      name: 'Ajan',
      description: 'Geçerli sayfada, insan onayıyla otonom tarama görevleri.',
    },
  },
  permissions: ['tabs', 'read-page', 'navigate'],
});
