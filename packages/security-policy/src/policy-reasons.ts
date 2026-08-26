/**
 * The closed set of reason codes the Policy Kernel can emit — Permission Debug's vocabulary.
 *
 * `PolicyResult.reason` used to be a bare `string`. The docblock called it "Permission Debug: why am I
 * being asked / blocked?", and the codes were genuinely well chosen — but nothing enumerated them, so
 * nothing could guarantee a user-facing explanation existed for each, and the surfaces that showed one
 * simply printed the identifier: a person hitting a wall read `Blocked by policy: tainted_side_effect`.
 *
 * Making it a union is what turns that from a documentation problem into a build problem. Adding a new
 * reason now fails to compile until it is listed here, and a completeness test fails until it has en+tr
 * text. That ordering matters: the explanation is written when the rule is written, by the person who
 * knows why the rule exists, rather than reverse-engineered later from a code name.
 */
export const POLICY_REASONS = [
  /** Read-only tool on an ordinary site — nothing to ask about. */
  'read_allowed',
  /** A read on a bank/crypto/password/health origin: allowed, but confirmed first. */
  'sensitive_site_read',
  /** Anything that CHANGES something on a sensitive origin. Denied outright, not asked. */
  'sensitive_site_lockout',
  /** A read on a tab whose egress is currently killed (dropped tunnel / DNS-leak anomaly): confirmed
   *  first, since the read will simply fail rather than reach anything. */
  'tab_egress_blocked_read',
  /** Anything that CHANGES state on a tab whose egress is currently killed. Denied outright — the
   *  network layer has already failed the connection closed, so there is nothing a human approval
   *  would unlock. */
  'tab_egress_blocked',
  /** A side-effecting call whose arguments came from page content the agent read (injection risk). */
  'tainted_side_effect',
  /** An ordinary state-changing action: confirm before it happens. */
  'state_change_confirm',
  /** Destructive (delete/overwrite). Confirm, and policy asks for a biometric. */
  'destructive_confirm',
  /** Spends money. Confirm, and policy asks for a biometric. */
  'financial_confirm',
  /** A tool whose risk class the registry does not state — treated as if it were dangerous. */
  'unknown_risk_confirm',
  /** Model-authored code that only reads. Allowed, and written to the journal. */
  'code_exec_read_journaled',
  /** Model-authored code that would WRITE. Reserved and refused in v1. */
  'code_exec_write_disabled',
  /**
   * The Egress Firewall found something shaped like a credential in a request about to leave the
   * device. Which kinds matched travels in the approval's `args`, not glued into the code — a reason
   * code is an identifier, and `egress_possible_secret:secret_token, pii_email` is neither stable nor
   * lookupable. (The union caught exactly that: this path was building its code by template.)
   */
  'egress_possible_secret',
  /** The user's trust profile for this site skipped a prompt the kernel would otherwise have shown. */
  'trust_profile_trusted',
  /** The user's trust profile for this site added a prompt the kernel would not otherwise have shown. */
  'trust_profile_restricted',
] as const;

export type PolicyReason = (typeof POLICY_REASONS)[number];

/** True when `value` is a reason this kernel can actually emit (IPC boundary / journal replay). */
export function isPolicyReason(value: string): value is PolicyReason {
  return (POLICY_REASONS as readonly string[]).includes(value);
}
