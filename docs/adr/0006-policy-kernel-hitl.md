# ADR-0006: Deterministic Policy Kernel + HITL (security-by-design)

- **Status:** Accepted
- **Date:** 2026-06-30

## Context
Every competitor was breached through the model layer: prompt injection (CometJacking, ShadowPrompt)
and excessive agency (1Password vault takeover, zero-click Drive wipe, `file://` leakage). Relying on
model guardrails is insufficient — "polite" phrasing bypasses them.

## Decision
Security is enforced by a **deterministic Policy Kernel that runs BEFORE the model**, not by model
guardrails. Tool calls are classified (`read` / `state_changing` / `destructive` / `financial`);
web-derived data is **tainted** ("untrusted read-only payload"); tainted + state-changing → forced
**HITL** (explicit confirmation, Windows Hello for high-risk). A single **Capability Broker** is the
only path from agent to tools (least-privilege). Sensitive sites (bank/crypto/health/password
managers) are locked out of automation by default. An Egress Firewall blocks exfiltration. LLM
tool-call arguments are treated as untrusted input and zod-validated.

## Consequences
- The whole critical-vulnerability class is closed in deterministic code, model-independent.
- Some autonomy is intentionally gated; UX mitigates with scoped trust profiles + reason codes to
  avoid permission fatigue.
- The same engine evaluates the prompt/rules policy IR (sealed, one-way narrowing) — see ADR-0007.

## Amendment 2026-08-16 — the autonomy level is main-enforced (a fixed defect)

Recorded by [S6-PR1](../../phases/ai-agent-super/phase-s6-safety-control-plane.md). **This documents a
defect that was fixed, not a decision that was taken** — the behaviour below was never intended by this
ADR, and the record exists so it cannot be mistaken for a design choice or reintroduced.

**The defect.** The kernel classified correctly and asked for confirmation, but the *answer* was decided
in the **renderer**: `autoApprovesTool` in the agent panel auto-answered the approval IPC from a
renderer-held `agentAutonomy` value. The kernel and the tool gateway never read `agentAutonomy` at all.
A doctored or compromised renderer could therefore approve its own `financial`, `credential` and
`destructive` calls — routing around the very gate this ADR establishes. The deterministic pre-model
kernel was sound; the decision had simply escaped the trust boundary behind it.

**The rule this ADR now states explicitly.** The renderer is untrusted. It may **display** an approval
and **relay** a human's click; it may never **decide** one. Every input to a security decision is read
in main, from main-held state.

Concretely:

- `AgentAutonomy` is defined in `@tepegoz/shared-types` (the single schema source), not in a UI package.
- `resolveAutonomy` (`@tepegoz/security-policy`) is the only place an autonomy level becomes a decision,
  and it runs in main against `PreferenceStore`.
- **Autonomy can only skip a prompt the kernel raised — it can never overturn a `deny`.** The
  sensitive-site lockout and every other denial stay absolute at all levels.
- **Biometric survives every level except explicit `auto`**: `act` auto-approves routine work but still
  stops for anything the kernel marked high-risk.
- Unknown or reserved levels (including `dangerous`) **fail safe to prompting**, never to more autonomy.
- When autonomy auto-approves, main resolves the request **without sending the IPC at all** — there is
  no outstanding request for a renderer to answer on the user's behalf.
- HITL ids are `randomUUID`, not sequential; responses are correlated against outstanding requests in
  main and settled exactly once, so an uncorrelated, guessed, or replayed response is rejected.

The autonomy gate deliberately sits **outside** the kernel: `PolicyKernel.evaluate` stays a pure
function of tool × taint × target, with no notion of user preference, so this ADR's "deterministic and
pre-model" property is preserved intact.
