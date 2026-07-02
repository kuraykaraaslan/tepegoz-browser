/**
 * Constant log/error messages for the MCP client (internal-ai-rules: messages live in a messages file,
 * never inline at throw sites). Core packages are not localized — these are developer/log strings; any
 * user-facing MCP strings live in the app/settings dictionary (ADR-0016/0018).
 */
export const McpMessages = {
  transportNotSupported: (transport: string): string =>
    `MCP transport "${transport}" is not supported in Phase 1a`,
  stdioRequiresCommand: 'An stdio MCP server requires a "command"',
  httpRequiresUrl: 'An http_sse MCP server requires a "url"',
  toolCallFailed: (server: string, tool: string): string =>
    `MCP tool call failed (${server} → ${tool})`,
  unknownTool: (id: string): string => `No MCP tool mapped to id "${id}"`,
  serverToolsError: 'The MCP server reported an error result',
  toolsTruncated: (server: string, kept: number, total: number): string =>
    `MCP server "${server}" advertised ${String(total)} tools; registered the first ${String(kept)}`,
  registerSkipped: (server: string, id: string): string =>
    `Skipped MCP tool "${id}" from "${server}" (id already registered)`,
} as const;
