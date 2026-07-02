import { AppError } from '@tepegoz/libs';
import { ToolNameSchema, type ToolDescriptor } from '@tepegoz/shared-types';
import { CapabilityMessages } from './messages';
import type { RegisteredTool } from './types';

/**
 * The single registry of everything the agent can do (L5). Built-in tools, MCP tools, skills, and
 * adapters all register here as one uniform `ToolDescriptor` + validator + handler — the agent never
 * sees which kind it is. Tool names are enforced to `{domain}_{verb}_{noun}` at registration.
 */
export default class CapabilityRegistry {
  private static readonly tools = new Map<string, RegisteredTool>();

  /** Test seam. */
  static reset(): void {
    CapabilityRegistry.tools.clear();
  }

  static register<T>(tool: RegisteredTool<T>): void {
    const id = ToolNameSchema.parse(tool.descriptor.id); // enforce naming convention
    if (CapabilityRegistry.tools.has(id)) {
      throw new AppError(CapabilityMessages.toolAlreadyRegistered(id), 409);
    }
    CapabilityRegistry.tools.set(id, tool as RegisteredTool);
  }

  /**
   * Remove a previously-registered tool (e.g. when an MCP server disconnects/backs off). Idempotent:
   * returns whether a tool was actually removed. Re-registering the same id afterwards is allowed.
   */
  static unregister(id: string): boolean {
    return CapabilityRegistry.tools.delete(id);
  }

  static get(id: string): RegisteredTool | undefined {
    return CapabilityRegistry.tools.get(id);
  }

  static list(): ToolDescriptor[] {
    return [...CapabilityRegistry.tools.values()].map((t) => t.descriptor);
  }
}
