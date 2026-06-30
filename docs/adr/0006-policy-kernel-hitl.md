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
