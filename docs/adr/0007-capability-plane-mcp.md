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
