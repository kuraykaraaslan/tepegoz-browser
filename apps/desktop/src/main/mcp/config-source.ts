import { Logger } from '@tepegoz/libs';
import { isExtensionEnabled, type ExtensionState, type McpServerPref } from '@tepegoz/desktop-ipc';
import { McpServerConfigSchema, type McpServerConfig } from '@tepegoz/mcp-client';
import type { ExtensionManifest } from '@tepegoz/extension-sdk';
import { extensionLabel } from '../../shared/extensions';

/**
 * Merge the desired MCP server set from BOTH sources (ADR-0018) — PURE so it is unit-testable without
 * Electron (the store/locale reads live in the supervisor wiring):
 *  - user preferences (`mcpServers`), and
 *  - enabled built-in extensions that declare an `mcpServer` (an extension's "skills" become
 *    agent-usable). An extension-declared server is gated ONLY on the extension being enabled in 1a;
 *    per-permission enforcement is Phase 3.
 * Each candidate is zod-validated; invalid ones are logged and skipped. Prefs win on an id clash.
 */
export function mergeMcpConfigs(
  prefs: { mcpServers: McpServerPref[]; extensions: ExtensionState[] },
  manifests: readonly ExtensionManifest[],
  locale: string,
): McpServerConfig[] {
  const out = new Map<string, McpServerConfig>();

  const add = (candidate: unknown, source: string): void => {
    const parsed = McpServerConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      Logger.warn('Skipping invalid MCP server config', { source });
      return;
    }
    if (!out.has(parsed.data.id)) out.set(parsed.data.id, parsed.data);
  };

  for (const s of prefs.mcpServers) {
    add({ ...s, source: 'prefs' }, `prefs:${s.id}`);
  }

  for (const m of manifests) {
    if (m.mcpServer === undefined || !isExtensionEnabled(prefs.extensions, m.id)) continue;
    add(
      {
        ...m.mcpServer,
        id: m.id,
        label: extensionLabel(m, locale).name,
        enabled: true,
        source: 'extension',
      },
      `extension:${m.id}`,
    );
  }

  return [...out.values()];
}
