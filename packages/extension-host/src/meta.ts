import { z } from 'zod';
import {
  capability,
  defineCapabilities,
  type ExtensionCapabilitySet,
} from '@tepegoz/extension-sdk';
import type { ExtensionManagementHost } from './types';

/**
 * Reserved reverse-DNS id for the host-level meta capabilities. Not a real extension — the main-process
 * wiring treats it as always-enabled so the agent can always discover/manage extensions.
 */
export const EXTENSION_HOST_ID = 'com.tepegoz.host';

const NoArgs = z.object({}).strip();
const IdArgs = z.object({ id: z.string().min(1).max(128) });
const UpdateArgs = z.object({ id: z.string().min(1).max(128), enabled: z.boolean() });

/**
 * The agent's extension-management meta-capabilities (ADR-0021): let the agent discover installed
 * extensions and toggle them, all behind the single PEP. `extension_update_item` is `state_changing`
 * → HITL (never silently flips an extension). Driven by an injected {@link ExtensionManagementHost}.
 */
export function extensionManagementCapabilities(): ExtensionCapabilitySet<ExtensionManagementHost> {
  return defineCapabilities(EXTENSION_HOST_ID, [
    capability<z.infer<typeof NoArgs>, ExtensionManagementHost>({
      id: 'extension_list_items',
      description:
        'List installed browser extensions with their enabled state, permissions, and the ' +
        'agent-callable capabilities each contributes. args: {} — returns an array of ' +
        '{ id, name, version, enabled, permissions, capabilities }.',
      dangerClass: 'read',
      inputSchema: NoArgs,
      handler: (_args, host) => host.list(),
    }),
    capability<z.infer<typeof IdArgs>, ExtensionManagementHost>({
      id: 'extension_get_item',
      description:
        'Get one extension by id. args: { id: string } — returns ' +
        '{ id, name, version, enabled, permissions, capabilities } or null.',
      dangerClass: 'read',
      inputSchema: IdArgs,
      handler: (args, host) => host.get(args.id) ?? null,
    }),
    capability<z.infer<typeof UpdateArgs>, ExtensionManagementHost>({
      id: 'extension_update_item',
      description:
        'Enable or disable an extension. args: { id: string, enabled: boolean } — returns the ' +
        'updated { id, name, version, enabled, permissions, capabilities }.',
      dangerClass: 'state_changing',
      inputSchema: UpdateArgs,
      handler: (args, host) => host.setEnabled(args.id, args.enabled),
    }),
  ]);
}
