import { describe, expect, it, vi } from 'vitest';

/**
 * `createClient` / `createTransport` — the Node concretions injected into the Electron-free MCP
 * supervisor. Pinned: the SDK `Client` identity; `createTransport` rejects a non-stdio transport
 * (501) and a stdio config with no command (400); and a valid stdio config yields a
 * `StdioClientTransport` whose env is the SDK safe-default subset merged with (and overridden by) the
 * server's configured env — never the full `process.env`.
 */

const ClientMock = vi.hoisted(() => vi.fn());
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: ClientMock }));

const StdioMock = vi.hoisted(() => vi.fn());
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: StdioMock,
  getDefaultEnvironment: () => ({ PATH: '/safe/bin', HOME: '/home/x' }),
}));

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError }));
vi.mock('@tepegoz/mcp-client', () => ({
  McpMessages: {
    transportNotSupported: (t: string) => `transport not supported: ${t}`,
    stdioRequiresCommand: 'stdio requires a command',
  },
}));

const { createClient, createTransport } = await import('./transport.electron');

describe('createClient', () => {
  it('builds the SDK client with the tepegoz identity', () => {
    createClient();
    expect(ClientMock).toHaveBeenCalledWith(
      { name: 'tepegoz', version: '0.0.0' },
      { capabilities: {} },
    );
  });
});

describe('createTransport', () => {
  it('rejects a non-stdio transport with a 501', () => {
    try {
      createTransport({ transport: 'http_sse' } as never);
      expect.unreachable();
    } catch (e) {
      expect((e as AppError).statusCode).toBe(501);
      expect((e as AppError).message).toContain('http_sse');
    }
  });

  it('rejects a stdio config with no command (400)', () => {
    try {
      createTransport({ transport: 'stdio' } as never);
      expect.unreachable();
    } catch (e) {
      expect((e as AppError).statusCode).toBe(400);
    }
  });

  it('builds a StdioClientTransport, merging the safe default env under the configured env', () => {
    createTransport({
      transport: 'stdio',
      command: 'node',
      args: ['server.js'],
      env: { HOME: '/override', TOKEN: 'abc' },
    } as never);
    expect(StdioMock).toHaveBeenCalledWith({
      command: 'node',
      args: ['server.js'],
      env: { PATH: '/safe/bin', HOME: '/override', TOKEN: 'abc' },
    });
  });
});
