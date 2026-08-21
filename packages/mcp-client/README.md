# @tepegoz/mcp-client (L5)

The **MCP client** (ADR-0018, refining ADR-0007): connects to external MCP servers and surfaces their
tools into the single `CapabilityRegistry`/`ToolGateway` PEP as ordinary `ToolDescriptor`s, so the
planner, Policy Kernel, HITL, taint, and audit machinery treat MCP tools identically to built-in ones.
Electron-free: the SDK `Client` and `StdioClientTransport` are injected by the desktop layer
(`main/mcp/*.electron.ts`); every SDK response is re-validated with zod here — the SDK itself is never
the trust boundary.

## Exports

- **`McpSupervisor`** / **`McpSupervisorDeps`** — manages every configured server's lifetime: connect on
  start, exponential-backoff reconnect on failure/drop, unregister a server's tools on disconnect, and
  `reconcile()` on config changes. One shared `NameMapper` keeps synthetic tool ids unique across servers.
- **`McpConnection`** / **`McpClientLike`** / **`McpConnectionDeps`** — one live server connection:
  discovers tools (`tools/list`), registers each into the `CapabilityRegistry`, and routes `tools/call`
  back through the reverse name map. Bounded to `MAX_TOOLS_PER_SERVER`/`MAX_SCHEMA_BYTES` so a hostile
  server can't flood the planner prompt.
- **`NameMapper`**, **`buildSyntheticId`**, **`serverSlug`**, **`tokenize`**, **`verbFor`** — builds the
  synthetic `{domain}_{verb}_{noun}` tool id per MCP tool and reverse-maps calls back to the server.
- **`McpServerConfigSchema`** / **`McpServerConfig`** / **`McpServerState`** / **`McpServerStatus`** —
  the per-server config + connection-status shapes surfaced to Settings.
- **`dangerClassFor`** / **`requiresIdempotencyFor`** — maps an MCP tool's annotations to a
  `dangerClass`, fail-safe (unknown/missing annotations default to the most restrictive class).
- **`jsonSchemaValidator`** — ajv-backed input validator built from an MCP tool's JSON Schema.
- **`McpToolSchema`**, **`McpToolListSchema`**, **`McpToolResultSchema`**, **`McpToolAnnotationsSchema`**
  — zod re-validation schemas for MCP SDK responses.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
