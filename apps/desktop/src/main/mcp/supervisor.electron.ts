import { Logger } from '@tepegoz/libs';
import { McpSupervisor, type McpServerConfig } from '@tepegoz/mcp-client';
import type { McpServerStatusInfo } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';
import { mergeMcpConfigs } from './config-source';
import { builtinManifests } from '../../shared/extensions';
import { mainLocale } from '../lib/i18n-main';
import { createClient, createTransport } from './transport.electron';

/** Read the current desired MCP config set from prefs + enabled extensions (Electron/store reads). */
function collectMcpConfigs(): McpServerConfig[] {
  const prefs = PreferenceStore.getAll();
  return mergeMcpConfigs(prefs, builtinManifests(), mainLocale());
}

/**
 * Main-process MCP supervisor singleton (ADR-0018). Started after the stores are ready and stopped on
 * quit. Wires the Electron/Node concretions (SDK client + stdio transport) into the Electron-free
 * `McpSupervisor`, sources server configs from prefs + enabled extensions, and exposes a read-only
 * status snapshot for the Settings "Connections / MCP" list. Status carries no secrets; connect/close
 * transitions are logged (redacted).
 */
let supervisor: McpSupervisor | null = null;

const McpService = {
  /** Start connecting configured servers. Safe/no-op if already started. Never throws (logs instead). */
  start(): void {
    if (supervisor !== null) return;
    try {
      supervisor = new McpSupervisor({
        clientFactory: createClient,
        transportFactory: createTransport,
        onStatus: (s) => {
          Logger.info('MCP server status', { id: s.id, state: s.state, tools: s.toolCount });
        },
      });
      supervisor.start(collectMcpConfigs());
    } catch (err) {
      Logger.warn('MCP supervisor failed to start', { err: String(err) });
    }
  },

  /** Re-sync the connected set to the current prefs/extension config (call after a prefs change). */
  async reconcile(): Promise<void> {
    if (supervisor === null) return;
    try {
      await supervisor.reconcile(collectMcpConfigs());
    } catch (err) {
      Logger.warn('MCP supervisor reconcile failed', { err: String(err) });
    }
  },

  /** Read-only status for every managed server (never carries secrets). */
  getStatus(): McpServerStatusInfo[] {
    return supervisor?.status() ?? [];
  },

  /** Disconnect all servers + cancel reconnects. Called from before-quit. */
  async stop(): Promise<void> {
    if (supervisor === null) return;
    const s = supervisor;
    supervisor = null;
    await s.stop();
  },
};

export default McpService;
