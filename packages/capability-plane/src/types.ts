import type { RiskTier, ToolDescriptor } from '@tepegoz/shared-types';
import type { PolicyResult, RiskClassification } from '@tepegoz/security-policy';

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
  /** Origin the run started from, so a cross-site submission can be told from a same-site one. */
  originUrl?: string;
  /** Required for create/upload-style tools (exactly-once-ish). */
  idempotencyKey?: string;
}

/** HITL prompt the gateway raises when policy says "ask". */
export interface ConfirmRequest {
  toolName: string;
  policy: PolicyResult;
  args: unknown;
  targetUrl?: string | undefined;
  /**
   * The derived risk tier for THIS call (tool × arguments × target) — the six-class axis, distinct
   * from the tool's self-declared `dangerClass`. Approvals are per-class rather than flat: the surface
   * can say *what kind* of act is being asked for, and a grant can cover `ui-write` while never
   * covering `credential`. Optional so an older confirm handler keeps compiling.
   */
  risk?: RiskClassification | undefined;
}

/** Audit record for every gated invocation (fed to the Event Journal later). */
export interface AuditEntry {
  toolName: string;
  decision: PolicyResult['decision'];
  reason: string;
  /** Derived risk tier, so the audit trail records the class an action was approved AS. */
  riskTier?: RiskTier;
  /**
   * S6 PR4: the advisory critic's verdict, when one ran. Present ⇒ a second opinion was taken on
   * whether this action still serves the user's request. **It never changed the decision** — a
   * divergence here means the call proceeded and was recorded as diverging, which is the whole point of
   * an advisory plane.
   */
  critic?: { aligned: boolean; reason: string };
}
