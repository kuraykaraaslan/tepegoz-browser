import { PolicyKernel } from '@tepegoz/security-policy';
import type { ToolError, ToolErrorCode } from '@tepegoz/shared-types';
import CapabilityRegistry from './registry';
import type { AuditEntry, ConfirmRequest, InvokeContext } from './types';

/**
 * The single Policy Enforcement Point (L5). EVERY tool call — built-in, MCP, skill, adapter — goes
 * through here, in this fixed order:
 *   lookup → idempotency check → validate (untrusted args) → Policy Kernel → HITL (if "ask") →
 *   execute → audit. The agent cannot bypass it. Returns the tool result, or a standard ToolError
 *   envelope (never throws across the boundary).
 */
function toolError(
  code: ToolErrorCode,
  message: string,
  retryable: boolean,
  details?: unknown,
): ToolError {
  return details === undefined
    ? { isError: true, code, message, retryable }
    : { isError: true, code, message, retryable, details };
}

export default class ToolGateway {
  private static confirmHandler: ((req: ConfirmRequest) => Promise<boolean>) | null = null;
  private static auditHandler: ((entry: AuditEntry) => void) | null = null;

  /** Wire the HITL prompt (renderer/UI). Without it, every "ask" decision fails safe to denied. */
  static setConfirmHandler(handler: ((req: ConfirmRequest) => Promise<boolean>) | null): void {
    ToolGateway.confirmHandler = handler;
  }

  static setAuditHandler(handler: ((entry: AuditEntry) => void) | null): void {
    ToolGateway.auditHandler = handler;
  }

  /** Test seam. */
  static reset(): void {
    ToolGateway.confirmHandler = null;
    ToolGateway.auditHandler = null;
  }

  static async invoke(toolName: string, rawArgs: unknown, ctx: InvokeContext = {}): Promise<unknown> {
    const tool = CapabilityRegistry.get(toolName);
    if (tool === undefined) {
      return toolError('NOT_FOUND', `Unknown tool: ${toolName}`, false);
    }

    if (
      tool.descriptor.requiresIdempotencyKey &&
      (ctx.idempotencyKey === undefined || ctx.idempotencyKey.length === 0)
    ) {
      return toolError('VALIDATION_ERROR', `Tool ${toolName} requires an idempotencyKey`, false);
    }

    const parsed = tool.inputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return toolError('VALIDATION_ERROR', `Invalid arguments for ${toolName}`, false, parsed.error.issues);
    }

    const policy = PolicyKernel.evaluate({
      descriptor: tool.descriptor,
      taintedArgs: ctx.taintedArgs ?? false,
      ...(ctx.targetUrl !== undefined ? { targetUrl: ctx.targetUrl } : {}),
    });
    ToolGateway.auditHandler?.({ toolName, decision: policy.decision, reason: policy.reason });

    if (policy.decision === 'deny') {
      return toolError('FORBIDDEN', `Blocked by policy: ${policy.reason}`, false);
    }
    if (policy.decision === 'ask') {
      const approved =
        ToolGateway.confirmHandler !== null &&
        (await ToolGateway.confirmHandler({ toolName, policy, args: parsed.data }));
      if (!approved) {
        return toolError('FORBIDDEN', `Denied at confirmation: ${policy.reason}`, false);
      }
    }

    try {
      return await tool.handler(parsed.data);
    } catch (err) {
      return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Tool failed', true);
    }
  }
}
