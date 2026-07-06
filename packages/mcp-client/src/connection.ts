import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { AppError, Logger } from '@tepegoz/libs';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { toolSuccess, type ToolDescriptor } from '@tepegoz/shared-types';
import type { McpServerConfig } from './config';
import { dangerClassFor, requiresIdempotencyFor } from './danger';
import { McpMessages } from './messages';
import NameMapper, { verbFor } from './naming';
import { McpToolListSchema, McpToolResultSchema } from './schemas';
import { jsonSchemaValidator } from './validator';

/** Bound so a hostile/huge server can't flood the planner prompt or blow the token budget. */
const MAX_TOOLS_PER_SERVER = 128;
const MAX_SCHEMA_BYTES = 64 * 1024;

/** The subset of the MCP SDK `Client` this connection uses (so tests can inject a double). */
export interface McpClientLike {
  connect(transport: Transport): Promise<void>;
  listTools(): Promise<unknown>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
  onclose?: (() => void) | undefined;
}

export interface McpConnectionDeps {
  client: McpClientLike;
  transport: Transport;
  mapper: NameMapper;
}

/**
 * One live connection to an external MCP server. Discovers its tools (`tools/list`), registers each
 * into the single CapabilityRegistry as a normal `ToolDescriptor` (so the planner/Policy Kernel/HITL
 * treat them identically to builtin tools), and routes `tools/call` back through the reverse name map.
 * All SDK responses are re-validated with zod here (the SDK is not the trust boundary).
 */
export default class McpConnection {
  private readonly registeredIds = new Set<string>();

  constructor(
    private readonly config: McpServerConfig,
    private readonly deps: McpConnectionDeps,
  ) {}

  /** Connect + discover + register tools. Returns the number of tools registered. */
  async connect(): Promise<number> {
    await this.deps.client.connect(this.deps.transport);
    return this.refreshTools();
  }

  private async refreshTools(): Promise<number> {
    const raw = await this.deps.client.listTools();
    const parsed = McpToolListSchema.safeParse(raw);
    if (!parsed.success) {
      Logger.warn('MCP tools/list failed validation', { server: this.config.id });
      return 0;
    }

    const tools = parsed.data.tools.slice(0, MAX_TOOLS_PER_SERVER);
    if (parsed.data.tools.length > tools.length) {
      Logger.warn(
        McpMessages.toolsTruncated(this.config.id, tools.length, parsed.data.tools.length),
      );
    }

    for (const tool of tools) {
      const schemaBytes = JSON.stringify(tool.inputSchema ?? {}).length;
      if (schemaBytes > MAX_SCHEMA_BYTES) {
        Logger.warn('MCP tool schema too large — skipped', {
          server: this.config.id,
          tool: tool.name,
        });
        continue;
      }
      const id = this.deps.mapper.assign(this.config.id, tool.name);
      const danger = dangerClassFor(tool.annotations);
      const descriptor: ToolDescriptor = {
        id,
        description: `[MCP: ${this.config.label} → ${tool.name}] ${tool.description}`,
        dangerClass: danger,
        source: 'mcp',
        inputSchema: tool.inputSchema,
        requiresIdempotencyKey: requiresIdempotencyFor(verbFor(tool.name), danger),
        provenance: this.config.id,
      };
      try {
        CapabilityRegistry.register({
          descriptor,
          inputSchema: jsonSchemaValidator(tool.inputSchema),
          handler: (args) => this.call(id, args as Record<string, unknown> | undefined),
        });
        this.registeredIds.add(id);
      } catch {
        // Defense-in-depth: a duplicate id (rare cross-server clash the mapper didn't catch) must not
        // abort the whole server — skip just this one tool.
        Logger.warn(McpMessages.registerSkipped(this.config.id, id));
      }
    }
    return this.registeredIds.size;
  }

  /** Invoke a mapped tool: reverse the synthetic id → `tools/call` → validated, taint-friendly result. */
  private async call(
    syntheticId: string,
    args: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    const target = this.deps.mapper.resolve(syntheticId);
    if (target === undefined) throw new AppError(McpMessages.unknownTool(syntheticId), 404);

    let raw: unknown;
    try {
      raw = await this.deps.client.callTool({
        name: target.toolName,
        ...(args !== undefined ? { arguments: args } : {}),
      });
    } catch (err) {
      // Never leak a server stack/message verbatim (may contain paths/secrets) — log redacted, throw clean.
      Logger.warn(McpMessages.toolCallFailed(this.config.id, target.toolName), {
        err: String(err),
      });
      throw new AppError(McpMessages.toolCallFailed(this.config.id, target.toolName), 502);
    }

    const parsed = McpToolResultSchema.safeParse(raw);
    if (!parsed.success)
      throw new AppError(McpMessages.toolCallFailed(this.config.id, target.toolName), 502);
    if (parsed.data.isError === true) throw new AppError(McpMessages.serverToolsError, 502);

    // Normalize text blocks under `content` so agent-service's existing taint tracking tags MCP output
    // as untrusted (web/external provenance) for subsequent-step escalation.
    const text = (parsed.data.content ?? [])
      .map((b) => (typeof b.text === 'string' ? b.text : ''))
      .filter((t) => t.length > 0)
      .join('\n');
    return toolSuccess('MCP tool returned content.', {
      content: {
        text,
        ...(parsed.data.structuredContent !== undefined
          ? { structuredContent: parsed.data.structuredContent }
          : {}),
      },
    });
  }

  /** Unregister this server's tools + free its ids, then close the transport. Idempotent. */
  async disconnect(): Promise<void> {
    for (const id of this.registeredIds) CapabilityRegistry.unregister(id);
    this.registeredIds.clear();
    this.deps.mapper.release(this.config.id);
    try {
      await this.deps.client.close();
    } catch {
      /* already closed / transport gone — nothing to do */
    }
  }

  get toolCount(): number {
    return this.registeredIds.size;
  }
}
