# ADR-0018: MCP client — external MCP servers behind the single PEP

- **Status:** Accepted
- **Date:** 2026-07-02
- **Refines:** [ADR-0007](0007-capability-plane-mcp.md) (Tepegöz is an MCP client and, later, server) —
  this ADR does not supersede it; it records how the **client** half is realized in Phase 1a.

## Context

Phase 1a's L5 calls for an **MCP client** so the internal agent can use tools from external MCP
servers. Two config sources are wanted: user preferences, and **built-in extensions that declare an
MCP server** (an extension's "skills" become agent-usable). Exposing Tepegöz _itself_ as an MCP server
(so external AIs drive the browser) is Phase 1b and is kept architecturally compatible, not built here.

The binding constraint: this is a security-by-design browser with a **single Policy Enforcement Point**
(`ToolGateway` → `PolicyKernel`) and a strict tool-naming rule (`ToolNameSchema`,
`{domain}_{verb}_{noun}`, closed verb set — from MCP_Server_Design_Rules). External MCP tools must not
bypass either.

## Decision

1. **All MCP tools route through the existing PEP.** Each discovered tool registers into the one
   `CapabilityRegistry` as a normal `ToolDescriptor` (`source: 'mcp'`); the planner, HITL, taint, audit
   and idempotency machinery treat it identically to a builtin tool. We do **not** use the Anthropic
   native `mcp_servers` connector in 1a — it would execute tools server-side, bypassing the local
   Policy Kernel, which is unacceptable for a security-first agent.
2. **Naming is reconciled, not relaxed.** `ToolNameSchema` stays strict. A deterministic `NameMapper`
   maps `(serverId, mcpToolName)` → a conformant synthetic id (`mcp<serverSlug>_<verb>_<noun>`, verb
   chosen from the approved set by heuristic, collisions resolved with a numeric suffix) plus a reverse
   map used at `tools/call` time. The model-facing description is prefixed `"[MCP: <label> → <realName>]"`
   so the LLM understands the tool.
3. **dangerClass is fail-safe from untrusted hints.** `readOnlyHint → read` (the only hint that may
   lower to auto-allow, still behind the sensitive-site lockout); `destructiveHint → destructive`;
   everything else → `state_changing` (→ HITL `ask`). A malicious/missing hint therefore never yields
   silent auto-execution of a side-effecting tool.
4. **Boundary validation with zod + ajv.** Every SDK response (`tools/list`, `tools/call`) is
   re-validated with zod (the SDK is transport convenience, never our trust boundary). MCP tool inputs
   (JSON Schema) are validated at the ToolGateway via an ajv-backed `InputValidator`; an unusable schema
   fails closed (accepts only `{}`).
5. **Official SDK, pinned; Electron-free core.** `@tepegoz/mcp-client` uses the official
   `@modelcontextprotocol/sdk` `Client` behind its `Transport` seam (exact-pinned `1.22.0` — the highest
   release still compatible with the repo's zod `3.23.8`, avoiding a repo-wide zod bump). The package is
   Electron- and app-free: `main/mcp/transport.electron.ts` injects the `StdioClientTransport` + `Client`
   and `main/mcp/supervisor.electron.ts` sources configs; enforced by a `dependency-cruiser` rule. ajv
   is added (pinned) as the standard JSON-Schema validator.
6. **Registry lifecycle.** `CapabilityRegistry.unregister(id)` is added; MCP tools register on connect
   and unregister on disconnect/backoff. The `McpSupervisor` connects in the background (a run offers
   whatever is registered at `list()` time — no wait-gate), health-reconnects with exponential backoff,
   and `reconcile()`s on prefs/extension changes.
7. **Extension-declared servers** (`manifest.mcpServer`) are gated in 1a **only** on the extension being
   enabled; per-permission enforcement of the manifest `permissions[]` set is Phase 3.
8. **UI scope.** 1a ships a **read-only** Settings → Connections status list (label/transport/state/
   tool-count); add/edit/remove of servers is deferred to Phase 1b (config via preferences meanwhile).

## Consequences

- MCP tools are indistinguishable from builtin tools to the agent, and every one is policy-gated.
- Synthetic names lose the original verb fidelity, but dangerClass (the security-relevant signal) is
  decided independently, and the real name rides in the description.
- Residual risk: a server spoofing `readOnlyHint` on a destructive tool → mitigated by the sensitive-site
  lockout + the plan-preview HITL before the loop; tighter server-trust/provenance is a later phase.
- The Phase-1b MCP **server** (exposing browser tools to external AIs, with Bearer/rate-limit/policy
  re-pass) builds on the same capability plane; nothing here blocks it.
