import type { RiskTier, ToolDescriptor } from '@tepegoz/shared-types';
import type { PolicyResult, RiskClassification } from '@tepegoz/security-policy';

/**
 * Minimal structural validator so a tool can bring ANY validation library (a zod schema satisfies
 * this) without coupling the capability plane to a specific zod instance.
 */
export interface InputValidator<T> {
  safeParse(
    data: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: unknown } };
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
  /**
   * Policy demanded a biometric confirmation for this call (destructive / financial / kamu write).
   * Recorded so the journal can distinguish "high-risk action approved with a fingerprint" from
   * "high-risk action approved by clicking OK" — which are the same event without this field.
   */
  biometricRequired?: boolean;
  /**
   * Whether that confirmation actually happened. `false` with `biometricRequired: true` means the
   * platform had no authenticator and the action proceeded anyway — an honest record of a control the
   * policy asked for and the machine could not provide.
   */
  biometricVerified?: boolean;
  /**
   * How an `ask` resolved. Absent for `allow`/`deny`, which need no human.
   *
   * The gateway used to emit one entry, BEFORE the prompt — so the trail said "we asked" and never
   * "the answer". For exactly the calls that require asking, that is the line you would want to read
   * later.
   */
  outcome?: 'approved' | 'refused';
}

/**
 * Platform biometric check. Resolves true only when the user actually authenticated.
 *
 * Injected rather than imported so the capability plane stays Electron-free: a Touch ID or Windows Hello
 * implementation lives in the desktop app, and the day one exists this becomes a one-line registration
 * instead of a change here.
 */
export type BiometricVerifier = (toolName: string, reason: string) => Promise<boolean>;
