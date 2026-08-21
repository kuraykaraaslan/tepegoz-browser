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

  /**
   * Register a tool.
   *
   * The validator and handler are checked AT RUNTIME, not just by the type. Types do not reach
   * everything that registers here: MCP tools arrive from an external process, extension capabilities
   * arrive from bundled JS, and both go through the same door. "All tool inputs are validated before
   * execution" is a security invariant of the whole agent — a tool that slipped in with a missing or
   * rubber-stamp validator would send LLM-produced arguments straight into a handler, and the failure
   * would be silent, because a permissive validator succeeds.
   *
   * The junk probe is a function value: nothing in a JSON-shaped schema accepts one, so a validator
   * that says yes to it is not validating. It is deliberately not a wrong-shaped OBJECT — many tools
   * take `{ tabId?: string }` and legitimately strip unknown keys, so an unexpected key proves nothing.
   */
  static register<T>(tool: RegisteredTool<T>): void {
    const id = ToolNameSchema.parse(tool.descriptor.id); // enforce naming convention
    if (CapabilityRegistry.tools.has(id)) {
      throw new AppError(CapabilityMessages.toolAlreadyRegistered(id), 409);
    }
    if (typeof tool.inputSchema?.safeParse !== 'function') {
      throw new AppError(CapabilityMessages.toolNeedsValidator(id), 400);
    }
    if (typeof tool.handler !== 'function') {
      throw new AppError(CapabilityMessages.toolNeedsHandler(id), 400);
    }
    if (CapabilityRegistry.acceptsAnything(tool)) {
      throw new AppError(CapabilityMessages.toolValidatorTooPermissive(id), 400);
    }
    CapabilityRegistry.tools.set(id, tool as RegisteredTool);
  }

  /** True when the validator accepts a value no real tool schema should. */
  private static acceptsAnything(tool: { inputSchema: RegisteredTool['inputSchema'] }): boolean {
    try {
      return tool.inputSchema.safeParse(() => undefined).success;
    } catch {
      // A validator that throws is not permissive; the gateway surfaces the throw as a failed call.
      return false;
    }
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
