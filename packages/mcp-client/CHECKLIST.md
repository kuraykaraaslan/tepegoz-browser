# @tepegoz/mcp-client CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support connecting to configured MCP servers.
- [x] Support injected MCP SDK clients and transports.
- [x] Support stdio server transport configuration.
- [x] Support future network transport metadata.
- [x] Support lifecycle supervision for multiple servers.
- [x] Support reconnect with exponential backoff after drops or failures.
- [x] Support unregistering server tools on disconnect.
- [x] Support reconciling connections after configuration changes.
- [x] Support discovering tools through tools/list.
- [x] Support registering discovered tools in the capability registry.
- [x] Support routing tool calls back to the original MCP server.
- [x] Support synthetic tool IDs that follow the shared naming convention.
- [x] Support reverse mapping from synthetic IDs to server tool names.
- [x] Support bounded tool count per server.
- [x] Support bounded schema size per tool.
- [x] Support zod re-validation of SDK responses.
- [x] Support JSON Schema based input validators.
- [x] Support danger-class inference from MCP annotations.
- [x] Support restrictive defaults for absent or unknown annotations.
- [x] Support idempotency requirements inferred from tool metadata.
- [x] Support server status reporting for settings surfaces.
- [x] Support human-readable connection errors.
- [ ] Support per-server state such as connected, connecting, failed, and disabled.
- [x] Support audit provenance for MCP-sourced tools.
- [ ] Support cancellation of in-flight MCP calls when possible.
- [ ] Support timeout protection for server calls.
- [x] Support duplicate synthetic ID handling across servers.
- [x] Support hostile-server safeguards for planner prompt size.
- [ ] Support test doubles for clients, transports, and registries.
- [ ] Support documentation for adding a new MCP server configuration.
