# ADR-0007: Unified Capability/Tool Plane; Tepegöz as MCP client and server

- **Status:** Accepted
- **Date:** 2026-06-30

## Context

The agent must use built-in tools, MCP servers, Skills, and integration adapters — and Tepegöz should
also expose its own browser/tab/DOM/journal tools to external clients (Claude, ChatGPT, Cursor).
These must all share one permission/HITL/audit model.

## Decision

A single **Capability/Tool Plane (L5)**: everything the agent can do is a normalized `ToolDescriptor`
(namespaced `{domain}_{verb}_{noun}` name, JSON-Schema I/O, danger class, source provenance) and
passes through **one gateway** (the Policy Enforcement Point) → schema-validate → policy/permission →
HITL → rate-limit → sandbox → output untrusted-tagging → Effect Ledger idempotency → audit event.
Tepegöz is both an **MCP client** (consumes external servers; prefer the SDK's native connector) and
an optional **MCP server** (exposes its tools over stdio + Streamable HTTP, behind Bearer auth +
rate-limit + the same gate). Standard MCP error envelope `{code, message, retryable}`. Third-party
MCP/skill code runs in a CapabilitySandbox (separate process; `file://` off by default).

## Consequences

- Adding a capability changes neither agent code, policy engine, nor UI.
- The exposed MCP server is a new trust boundary → ADR'd as a separate process; inbound auth required.
- Avoid reinventing SDK primitives (tool runner, MCP helpers, server-side tool-search) where they fit.

### Implementation status (checked 2026-09-16, not previously recorded here)

The single-gateway half of this decision is real and load-bearing — every tool, `mcp`-sourced or
otherwise, passes through the one `ToolGateway` PEP with no source-based exception (verified: nothing
in `security-policy`/`capability-plane` branches on `descriptor.source === 'mcp'`). Two other clauses
did not land as written, and `docs/threat-model.md` had been citing the first as if it had:

- **No component named or shaped like a "CapabilitySandbox" exists.** What was built instead: an MCP
  server runs as an ordinary `stdio` child process with a restricted environment (the SDK's safe
  default env subset plus the server's own declared `env`, never the full `process.env` —
  [`transport.electron.ts`](../../apps/desktop/src/main/mcp/transport.electron.ts)) — real isolation,
  just not the dedicated sandbox this ADR named. `file://` is not specifically switched off for MCP;
  the actual backstop is that filesystem access for ANY tool call (`mcp`-sourced or builtin) already
  goes through `@tepegoz/file-operations`'s real path-membership sandbox
  ([ADR-0022](0022-file-operations-sandbox.md)), so an MCP tool gets no more filesystem reach than a
  builtin one already has — general coverage rather than an MCP-specific control.
- **Tepegöz as an MCP server (exposing its own tools outbound) is not built.** Everything under
  `apps/desktop/src/main/mcp/` (`config-source.ts`, `supervisor.electron.ts`, `transport.electron.ts`)
  is the CLIENT half — connecting to and reconciling externally-configured MCP servers. No code
  creates an outbound-facing MCP server exposing Tepegöz's own tools; `docs/threat-model.md`'s "Inbound
  MCP server requests" entry point is already phrased conditionally ("when Tepegöz exposes its
  tools"), which is the accurate way to read it today.
