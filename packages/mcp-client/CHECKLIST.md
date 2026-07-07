# @tepegoz/mcp-client CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support connecting to configured MCP servers.
- [ ] Support injected MCP SDK clients and transports.
- [ ] Support stdio server transport configuration.
- [ ] Support future network transport metadata.
- [ ] Support lifecycle supervision for multiple servers.
- [ ] Support reconnect with exponential backoff after drops or failures.
- [ ] Support unregistering server tools on disconnect.
- [ ] Support reconciling connections after configuration changes.
- [ ] Support discovering tools through tools/list.
- [ ] Support registering discovered tools in the capability registry.
- [ ] Support routing tool calls back to the original MCP server.
- [ ] Support synthetic tool IDs that follow the shared naming convention.
- [ ] Support reverse mapping from synthetic IDs to server tool names.
- [ ] Support bounded tool count per server.
- [ ] Support bounded schema size per tool.
- [ ] Support zod re-validation of SDK responses.
- [ ] Support JSON Schema based input validators.
- [ ] Support danger-class inference from MCP annotations.
- [ ] Support restrictive defaults for absent or unknown annotations.
- [ ] Support idempotency requirements inferred from tool metadata.
- [ ] Support server status reporting for settings surfaces.
- [ ] Support human-readable connection errors.
- [ ] Support per-server state such as connected, connecting, failed, and disabled.
- [ ] Support audit provenance for MCP-sourced tools.
- [ ] Support cancellation of in-flight MCP calls when possible.
- [ ] Support timeout protection for server calls.
- [ ] Support duplicate synthetic ID handling across servers.
- [ ] Support hostile-server safeguards for planner prompt size.
- [ ] Support test doubles for clients, transports, and registries.
- [ ] Support documentation for adding a new MCP server configuration.
