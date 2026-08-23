# @tepegoz/security-policy (L8)

The **deterministic Policy Kernel** (ADR-0006): security enforced in plain code _before_ the model,
never delegated to model guardrails. Given a tool call's danger class, taint, and target site it
returns allow/deny/ask plus a stable machine-readable reason code (Permission Debug) and whether
HIGH-RISK actions require biometric (Windows Hello) confirmation. Also owns the supporting
primitives: the sensitive-site category list, the human-handoff (captcha/2FA) detector, the taint
tracker for web-derived data, and the outbound Egress Firewall.

> **ADR-0039 (2026-08-23) changes what a sensitive-site match means, not who decides it.** A category
> match still produces a deterministic `deny` before the model runs; what is new is that an out-of-band
> **user grant** can lift that deny for one category. Autonomy still cannot, and no agent tool can create
> a grant. The grant input is not yet implemented here — `isSensitiveSite` remains an unconditional deny
> until it is (see CHECKLIST). Pure TypeScript — no Electron, no
I/O — so it is fully unit-testable and consumed by `@tepegoz/capability-plane` as the single
decision point behind the ToolGateway PEP.

## Exports

- **`PolicyKernel.evaluate(ctx)`** — the core decision function; `PolicyContext` in, `PolicyResult`
  (`decision`/`reason`/`biometric`) out. Locks out sensitive sites, forces HITL on tainted
  state-changing calls, and gates by danger class (`read`/`state_changing`/`destructive`/`financial`).
- **`isSensitiveSite`** — URL allow/deny check for the bank/crypto/health/password-manager category list.
  Per ADR-0039 this becomes the *pre-grant* check: a match denies unless an active user grant covers the
  category.
- **`detectHandoff`** / **`HANDOFF_KINDS`** — detects when a page requires captcha/2FA handling. Per
  ADR-0039 these are cleared automatically (2FA through the Credential Broker); handoff is the fallback
  for a challenge the browser cannot clear.
- **`TaintTracker`**, **`argsAreTainted`**, **`findTaintedValues`**, **`isUntrustedProvenance`**,
  **`PROVENANCE_LEVELS`** — marks and queries whether tool-call arguments are derived from untrusted
  web content, driving the Policy Kernel's forced-HITL rule.
- **`EgressFirewall`**, **`inspectEgress`**, **`shannonEntropy`**, **`EGRESS_FINDING_KINDS`** — inspects
  outbound data for exfiltration risk (secrets/high-entropy blobs) and returns an `EgressVerdict`.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
