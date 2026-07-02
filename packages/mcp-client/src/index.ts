/**
 * `@tepegoz/mcp-client` — the MCP CLIENT (L5): connect to external MCP servers and surface their tools
 * into the single CapabilityRegistry / ToolGateway PEP as ordinary `ToolDescriptor`s, so the planner,
 * Policy Kernel, HITL, taint and audit machinery treat them identically to builtin tools (ADR-0018,
 * refining ADR-0007). Electron-free: the SDK `Client` + transport are injected by the desktop layer;
 * every SDK response is re-validated with zod here (the SDK is never the trust boundary).
 */
export { default as McpSupervisor, type McpSupervisorDeps } from './supervisor';
export { default as McpConnection, type McpClientLike, type McpConnectionDeps } from './connection';
export { default as NameMapper, buildSyntheticId, serverSlug, tokenize, verbFor } from './naming';
export {
  McpServerConfigSchema,
  type McpServerConfig,
  type McpServerState,
  type McpServerStatus,
} from './config';
export { dangerClassFor, requiresIdempotencyFor } from './danger';
export { jsonSchemaValidator } from './validator';
export {
  McpToolSchema,
  McpToolListSchema,
  McpToolResultSchema,
  McpToolAnnotationsSchema,
  type McpTool,
  type McpToolResult,
  type McpToolAnnotations,
} from './schemas';
export { McpMessages } from './messages';
