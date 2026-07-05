# @tepegoz/security-policy (L8)

The **deterministic Policy Kernel** (ADR-0006): security enforced in plain code *before* the model,
never delegated to model guardrails. Given a tool call's danger class, taint, and target site it
returns allow/deny/ask plus a stable machine-readable reason code (Permission Debug) and whether
HIGH-RISK actions require biometric (Windows Hello) confirmation. Also owns the supporting
primitives: the sensitive-site lockout list, the human-handoff (captcha/2FA) detector, the taint
tracker for web-derived data, and the outbound Egress Firewall. Pure TypeScript — no Electron, no
I/O — so it is fully unit-testable and consumed by `@tepegoz/capability-plane` as the single
decision point behind the ToolGateway PEP.

## Exports
- **`PolicyKernel.evaluate(ctx)`** — the core decision function; `PolicyContext` in, `PolicyResult`
  (`decision`/`reason`/`biometric`) out. Locks out sensitive sites, forces HITL on tainted
  state-changing calls, and gates by danger class (`read`/`state_changing`/`destructive`/`financial`).
- **`isSensitiveSite`** — URL allow/deny check for the bank/crypto/health/password-manager lockout list.
- **`detectHandoff`** / **`HANDOFF_KINDS`** — detects when a page requires human handoff (e.g. captcha,
  2FA) so the agent can pause and hand control to the user.
- **`TaintTracker`**, **`argsAreTainted`**, **`findTaintedValues`**, **`isUntrustedProvenance`**,
  **`PROVENANCE_LEVELS`** — marks and queries whether tool-call arguments are derived from untrusted
  web content, driving the Policy Kernel's forced-HITL rule.
- **`EgressFirewall`**, **`inspectEgress`**, **`shannonEntropy`**, **`EGRESS_FINDING_KINDS`** — inspects
  outbound data for exfiltration risk (secrets/high-entropy blobs) and returns an `EgressVerdict`.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
