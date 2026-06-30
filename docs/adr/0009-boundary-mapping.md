# ADR-0009: Boundary mapping — HTTP-semantic AppError → IPC / tool-call

- **Status:** Accepted
- **Date:** 2026-06-30

## Context
The internal code-structure rules assume an HTTP server (routes, `{ message }` envelope, status
codes). Electron has no HTTP route layer; its boundaries are typed IPC handlers, agent tool calls,
and the MCP server. We must keep the contract's intent without assuming HTTP.

## Decision
Services **throw `AppError(message, statusCode)`** (constant messages, never inline). A single
**boundary** (IPC handler / tool-call / MCP) catches and maps to `{ message, statusCode }` via
`toBoundary()` (`instanceof AppError ? statusCode : 500`); string-matching to derive status is
forbidden. HTTP status semantics are preserved as a shared vocabulary: 401 auth, 403 policy-deny,
404 not-found, 409 bad-state, 503 LLM/upstream down. The MCP surface additionally uses the standard
MCP error envelope (ADR-0007).

## Consequences
- One consistent error contract across IPC, tool calls, and MCP — no HTTP assumptions leak in.
- Renderer receives structured `{ message, statusCode }`; user-facing text is localized via i18n.
