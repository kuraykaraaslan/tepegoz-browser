import { defineExtension } from '@tepegoz/extension-sdk';

/** The Agent extension manifest — validated against the SDK schema at module load (dev-time contract). */
export const agentManifest = defineExtension({
  id: 'agent',
  name: 'Agent',
  version: '0.1.0',
  description: 'Autonomous browsing tasks on the current page, with human approval.',
  kind: 'panel',
  permissions: ['tabs', 'read-page', 'navigate'],
});
