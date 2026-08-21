import type { RegisteredTool } from '@tepegoz/capability-plane';
import type { ExtensionCapabilitySet } from '@tepegoz/extension-sdk';
import type { CapabilityRegistryPort } from './types';

interface Provider {
  extensionId: string;
  /** Registry tools with the concrete host already bound into each handler. */
  tools: readonly RegisteredTool[];
}

export interface SupervisorDeps {
  registry: CapabilityRegistryPort;
  /** Whether an extension is currently enabled (from prefs). */
  isEnabled: (extensionId: string) => boolean;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * In-process analogue of the `McpSupervisor` (ADR-0021). Registers an ENABLED extension's
 * capabilities into the single `CapabilityRegistry` (behind the `ToolGateway` PEP), and unregisters
 * them when the extension is disabled. {@link reconcile} is idempotent — call it at startup and on
 * every prefs/enable change; no `agent-runtime` change is needed because the planner already
 * enumerates `CapabilityRegistry.list()`.
 */
export class ExtensionCapabilitySupervisor {
  private readonly providers: Provider[] = [];
  private readonly registered = new Set<string>();

  constructor(private readonly deps: SupervisorDeps) {}

  /**
   * Register an extension's capability set with its (already-constructed) host. Binds the host into
   * each handler here so per-extension host types stay local. Does NOT touch the registry — call
   * {@link reconcile} afterwards (and whenever the enabled set changes).
   */
  provide<H>(set: ExtensionCapabilitySet<H>, host: H): void {
    const tools = set.capabilities.map((cap): RegisteredTool => ({
      descriptor: cap.descriptor,
      inputSchema: cap.inputSchema,
      handler: (args) => cap.handler(args, host),
    }));
    this.providers.push({ extensionId: set.extensionId, tools });
  }

  /** Sync the registry to the enabled set: register enabled providers' tools, unregister disabled. */
  reconcile(): void {
    for (const provider of this.providers) {
      const enabled = this.deps.isEnabled(provider.extensionId);
      for (const tool of provider.tools) {
        const id = tool.descriptor.id;
        if (enabled && !this.registered.has(id)) {
          // Never clobber a same-named tool from another source; skip if already present.
          if (!this.deps.registry.has(id)) {
            this.deps.registry.register(tool);
            this.registered.add(id);
            this.deps.log?.('extension capability registered', { id, ext: provider.extensionId });
          }
        } else if (!enabled && this.registered.has(id)) {
          this.deps.registry.unregister(id);
          this.registered.delete(id);
          this.deps.log?.('extension capability unregistered', { id, ext: provider.extensionId });
        }
      }
    }
  }

  /** Ids currently registered by this supervisor (for status / tests). */
  registeredIds(): string[] {
    return [...this.registered];
  }
}
