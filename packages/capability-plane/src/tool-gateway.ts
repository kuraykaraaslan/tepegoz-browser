import { classifyRisk, PolicyKernel } from '@tepegoz/security-policy';
import type { ToolError, ToolErrorCode } from '@tepegoz/shared-types';
import { AsyncLocalStorage } from 'node:async_hooks';
import CapabilityRegistry from './registry';
import { critiqueIntent, summarizeArgs } from './intent-critic';
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
  private static readonly handlerScope = new AsyncLocalStorage<{
    confirmHandler: ((req: ConfirmRequest) => Promise<boolean>) | null;
    auditHandler: ((entry: AuditEntry) => void) | null;
    /** S6 PR4: the run's original request, so the advisory critic can judge alignment against it. */
    goal: string;
  }>();

  /** Wire the HITL prompt (renderer/UI). Without it, every "ask" decision fails safe to denied. */
  static setConfirmHandler(handler: ((req: ConfirmRequest) => Promise<boolean>) | null): void {
    ToolGateway.confirmHandler = handler;
  }

  static setAuditHandler(handler: ((entry: AuditEntry) => void) | null): void {
    ToolGateway.auditHandler = handler;
  }

  /**
   * Scope HITL/audit handlers to one async agent run. This keeps concurrent runs from overwriting each
   * other's callbacks while preserving the legacy setters as process-defaults for tests/static callers.
   */
  static runWithHandlers<T>(
    handlers: {
      confirmHandler?: ((req: ConfirmRequest) => Promise<boolean>) | null;
      auditHandler?: ((entry: AuditEntry) => void) | null;
      /** The user's request for this run — supplied so the advisory critic has something to align to. */
      goal?: string;
    },
    fn: () => Promise<T>,
  ): Promise<T> {
    return ToolGateway.handlerScope.run(
      {
        confirmHandler: handlers.confirmHandler ?? null,
        auditHandler: handlers.auditHandler ?? null,
        goal: handlers.goal ?? '',
      },
      fn,
    );
  }

  /** Test seam. */
  static reset(): void {
    ToolGateway.confirmHandler = null;
    ToolGateway.auditHandler = null;
  }

  static async invoke(
    toolName: string,
    rawArgs: unknown,
    ctx: InvokeContext = {},
  ): Promise<unknown> {
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
      return toolError(
        'VALIDATION_ERROR',
        `Invalid arguments for ${toolName}`,
        false,
        parsed.error.issues,
      );
    }

    const policy = PolicyKernel.evaluate({
      descriptor: tool.descriptor,
      taintedArgs: ctx.taintedArgs ?? false,
      ...(ctx.targetUrl !== undefined ? { targetUrl: ctx.targetUrl } : {}),
      // Read off the DESCRIPTOR, never off the call. A caller that could name its own capability
      // class could name the harmless one.
      ...(tool.descriptor.capability !== undefined
        ? { capability: tool.descriptor.capability }
        : {}),
    });
    // Classified on the VALIDATED args, so the tier reflects what will actually run. This is the
    // per-class axis that replaces flat per-tool approval: `dangerClass` says what the tool author
    // claims, `risk.tier` says what this specific call does.
    const risk = classifyRisk({
      descriptor: tool.descriptor,
      args: parsed.data,
      ...(ctx.targetUrl !== undefined ? { targetUrl: ctx.targetUrl } : {}),
      ...(ctx.originUrl !== undefined ? { originUrl: ctx.originUrl } : {}),
    });
    const scoped = ToolGateway.handlerScope.getStore();
    const auditHandler = scoped !== undefined ? scoped.auditHandler : ToolGateway.auditHandler;

    // S6 PR4 — the advisory critic plane. It runs AFTER the deterministic kernel and BEFORE dispatch, and
    // it cannot change what happens next: the verdict is recorded on the audit entry and nothing reads it
    // to decide. ADR-0006's "deterministic and pre-model" kernel is untouched because the kernel has
    // already spoken. It never sees argument VALUES — only key names and shapes — so it cannot become a
    // second channel for the secret the credential broker exists to keep out of model context.
    const critic = await critiqueIntent(
      {
        goal: scoped?.goal ?? '',
        toolName,
        tier: risk.tier,
        ...(ctx.targetUrl !== undefined ? { targetUrl: ctx.targetUrl } : {}),
        argSummary: summarizeArgs(parsed.data),
      },
      risk.tier,
    );

    auditHandler?.({
      toolName,
      decision: policy.decision,
      reason: policy.reason,
      riskTier: risk.tier,
      ...(critic !== null ? { critic } : {}),
    });

    if (policy.decision === 'deny') {
      return toolError('FORBIDDEN', `Blocked by policy: ${policy.reason}`, false);
    }
    if (policy.decision === 'ask') {
      const confirmHandler =
        scoped !== undefined ? scoped.confirmHandler : ToolGateway.confirmHandler;
      const approved =
        confirmHandler !== null &&
        (await confirmHandler({
          toolName,
          policy,
          args: parsed.data,
          risk,
          ...(ctx.targetUrl !== undefined ? { targetUrl: ctx.targetUrl } : {}),
        }));
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
