import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { PolicyResult } from '@tepegoz/security-policy';

/**
 * Minimal structural validator so a tool can bring ANY validation library (a zod schema satisfies
 * this) without coupling the capability plane to a specific zod instance.
 */
export interface InputValidator<T> {
  safeParse(data: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: unknown } };
}

export interface RegisteredTool<T = unknown> {
  descriptor: ToolDescriptor;
  /** Validates the (untrusted) tool-call arguments before execution. */
  inputSchema: InputValidator<T>;
  /** Executes the tool. May be sync or async; the gateway awaits the result. */
  handler: (args: T) => unknown;
}

export interface InvokeContext {
  /** Any argument is derived from untrusted web content (taint). */
  taintedArgs?: boolean;
  /** URL the action targets (sensitive-site lockout). */
  targetUrl?: string;
  /** Required for create/upload-style tools (exactly-once-ish). */
  idempotencyKey?: string;
}

/** HITL prompt the gateway raises when policy says "ask". */
export interface ConfirmRequest {
  toolName: string;
  policy: PolicyResult;
  args: unknown;
  targetUrl?: string | undefined;
}

/** Audit record for every gated invocation (fed to the Event Journal later). */
export interface AuditEntry {
  toolName: string;
  decision: PolicyResult['decision'];
  reason: string;
}
