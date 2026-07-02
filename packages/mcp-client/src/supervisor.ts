import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Logger } from '@tepegoz/libs';
import McpConnection, { type McpClientLike } from './connection';
import type { McpServerConfig, McpServerState, McpServerStatus } from './config';
import NameMapper from './naming';

const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 60_000;

export interface McpSupervisorDeps {
  /** Create a fresh MCP client (prod: SDK `Client`; tests: a double). */
  clientFactory: () => McpClientLike;
  /** Build the transport for a server (prod: `StdioClientTransport`; tests: an in-memory transport). */
  transportFactory: (config: McpServerConfig) => Transport;
  /** Status change sink (feeds the read-only Settings list + a redacted journal event). */
  onStatus?: (status: McpServerStatus) => void;
}

interface ServerEntry {
  config: McpServerConfig;
  state: McpServerState;
  attempt: number;
  connection: McpConnection | null;
  timer: ReturnType<typeof setTimeout> | null;
  removing: boolean;
  error?: string;
}

/**
 * Manages the lifetime of every configured MCP server: connect on start, reconnect with exponential
 * backoff on connect-failure or a dropped connection, unregister a server's tools on disconnect, and
 * `reconcile()` when the config set changes (prefs/extension toggles). One shared {@link NameMapper}
 * keeps synthetic tool ids globally unique across servers. Electron-free: the client + transport are
 * injected, so this is unit-testable with an in-memory transport and no child processes.
 */
export default class McpSupervisor {
  private readonly entries = new Map<string, ServerEntry>();
  private readonly mapper = new NameMapper();

  constructor(private readonly deps: McpSupervisorDeps) {}

  /** Connect all enabled servers. Safe to call once at startup. */
  start(configs: McpServerConfig[]): void {
    for (const config of configs) {
      if (config.enabled) this.addServer(config);
    }
  }

  /** Snapshot of every managed server's status (never carries secrets). */
  status(): McpServerStatus[] {
    return [...this.entries.values()].map((e) => ({
      id: e.config.id,
      label: e.config.label,
      transport: e.config.transport,
      state: e.state,
      toolCount: e.connection?.toolCount ?? 0,
      ...(e.error !== undefined ? { error: e.error } : {}),
    }));
  }

  /** Add/remove/replace servers to match a new desired config set (enabled ones only). */
  async reconcile(configs: McpServerConfig[]): Promise<void> {
    const desired = new Map(configs.filter((c) => c.enabled).map((c) => [c.id, c]));
    for (const id of [...this.entries.keys()]) {
      if (!desired.has(id)) await this.removeServer(id);
    }
    for (const [id, config] of desired) {
      const existing = this.entries.get(id);
      if (existing === undefined) {
        this.addServer(config);
      } else if (JSON.stringify(existing.config) !== JSON.stringify(config)) {
        await this.removeServer(id);
        this.addServer(config);
      }
    }
  }

  /** Disconnect everything and cancel pending reconnects. Called from before-quit. */
  async stop(): Promise<void> {
    for (const id of [...this.entries.keys()]) await this.removeServer(id);
  }

  private addServer(config: McpServerConfig): void {
    if (this.entries.has(config.id)) return;
    const entry: ServerEntry = {
      config,
      state: 'idle',
      attempt: 0,
      connection: null,
      timer: null,
      removing: false,
    };
    this.entries.set(config.id, entry);
    void this.connectEntry(entry);
  }

  private setState(entry: ServerEntry, state: McpServerState, error?: string): void {
    entry.state = state;
    if (error === undefined) delete entry.error;
    else entry.error = error;
    this.deps.onStatus?.({
      id: entry.config.id,
      label: entry.config.label,
      transport: entry.config.transport,
      state,
      toolCount: entry.connection?.toolCount ?? 0,
      ...(error !== undefined ? { error } : {}),
    });
  }

  private async connectEntry(entry: ServerEntry): Promise<void> {
    if (entry.removing) return;
    this.setState(entry, 'connecting');

    let client: McpClientLike;
    let transport: Transport;
    try {
      client = this.deps.clientFactory();
      transport = this.deps.transportFactory(entry.config);
    } catch (err) {
      // A permanent config/transport error (e.g. unsupported transport) — surface it, do NOT loop.
      this.setState(entry, 'error', String(err instanceof Error ? err.message : err));
      return;
    }

    client.onclose = () => {
      this.onClosed(entry);
    };
    const connection = new McpConnection(entry.config, { client, transport, mapper: this.mapper });

    try {
      const count = await connection.connect();
      if (entry.removing) {
        await connection.disconnect();
        return;
      }
      entry.connection = connection;
      entry.attempt = 0;
      this.setState(entry, 'ready');
      Logger.info('MCP server connected', { server: entry.config.id, tools: count });
    } catch (err) {
      this.setState(entry, 'error', String(err instanceof Error ? err.message : err));
      this.scheduleReconnect(entry);
    }
  }

  private onClosed(entry: ServerEntry): void {
    if (entry.removing) return;
    // A live connection dropped: unregister its tools and back off to reconnect.
    if (entry.connection !== null) {
      void entry.connection.disconnect();
      entry.connection = null;
    }
    this.setState(entry, 'error', 'connection closed');
    this.scheduleReconnect(entry);
  }

  private scheduleReconnect(entry: ServerEntry): void {
    if (entry.removing || entry.timer !== null) return;
    const delay = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** entry.attempt);
    const jittered = delay / 2 + Math.random() * (delay / 2);
    entry.attempt += 1;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.connectEntry(entry);
    }, jittered);
  }

  private async removeServer(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    entry.removing = true;
    if (entry.timer !== null) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    if (entry.connection !== null) {
      await entry.connection.disconnect();
      entry.connection = null;
    }
    this.entries.delete(id);
  }
}
