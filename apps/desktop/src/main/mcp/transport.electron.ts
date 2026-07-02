import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { AppError } from '@tepegoz/libs';
import { McpMessages, type McpClientLike, type McpServerConfig } from '@tepegoz/mcp-client';

/**
 * Electron/Node concretions injected into the (Electron-free) MCP supervisor: a real SDK `Client` and,
 * for stdio servers, a `StdioClientTransport`. Secret hygiene: the child process inherits ONLY the
 * SDK's safe default env subset plus the server's explicitly-configured `env` — never the full
 * `process.env`. `http_sse` is rejected until Phase 1b.
 */
export function createClient(): McpClientLike {
  return new Client({ name: 'tepegoz', version: '0.0.0' }, { capabilities: {} });
}

export function createTransport(config: McpServerConfig): Transport {
  if (config.transport !== 'stdio') {
    throw new AppError(McpMessages.transportNotSupported(config.transport), 501);
  }
  if (config.command === undefined) throw new AppError(McpMessages.stdioRequiresCommand, 400);
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...getDefaultEnvironment(), ...config.env },
  });
}
