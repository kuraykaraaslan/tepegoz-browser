import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistry, ToolGateway, type InvokeContext } from '@tepegoz/capability-plane';
import type { ToolError } from '@tepegoz/shared-types';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import McpConnection, { type McpClientLike } from './connection';
import NameMapper from './naming';
import type { McpServerConfig } from './config';

const CONFIG: McpServerConfig = {
  id: 'files',
  label: 'Files',
  transport: 'stdio',
  command: 'x',
  args: [],
  env: {},
  enabled: true,
  source: 'prefs',
};

const TOOLS = [
  {
    name: 'read_file',
    description: 'reads a file',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'delete_file',
    description: 'deletes a file',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    annotations: { destructiveHint: true },
  },
];

const stubTransport = {} as unknown as Transport;

class FakeClient implements McpClientLike {
  onclose?: () => void;
  constructor(
    private readonly onCall = vi.fn(() => ({ content: [{ type: 'text', text: 'FILE BODY' }] })),
  ) {}
  connect(): Promise<void> {
    return Promise.resolve();
  }
  listTools(): Promise<unknown> {
    return Promise.resolve({ tools: TOOLS });
  }
  callTool(): Promise<unknown> {
    return Promise.resolve(this.onCall());
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  get calls(): typeof this.onCall {
    return this.onCall;
  }
}

const isToolError = (v: unknown): v is ToolError =>
  typeof v === 'object' && v !== null && (v as { isError?: unknown }).isError === true;
const CTX: InvokeContext = {};

beforeEach(() => {
  CapabilityRegistry.reset();
  ToolGateway.reset();
});

describe('McpConnection', () => {
  it('registers discovered tools with synthetic ids + mapped danger classes', async () => {
    const conn = new McpConnection(CONFIG, {
      client: new FakeClient(),
      transport: stubTransport,
      mapper: new NameMapper(),
    });
    const n = await conn.connect();
    expect(n).toBe(2);

    const read = CapabilityRegistry.get('mcpfiles_get_file');
    const del = CapabilityRegistry.get('mcpfiles_delete_file');
    expect(read?.descriptor.dangerClass).toBe('read');
    expect(read?.descriptor.source).toBe('mcp');
    expect(read?.descriptor.description).toContain('read_file');
    expect(del?.descriptor.dangerClass).toBe('destructive');
    expect(del?.descriptor.requiresIdempotencyKey).toBe(true);
  });

  it('routes a read tool through the ToolGateway and returns normalized content', async () => {
    const conn = new McpConnection(CONFIG, {
      client: new FakeClient(),
      transport: stubTransport,
      mapper: new NameMapper(),
    });
    await conn.connect();
    const result = await ToolGateway.invoke('mcpfiles_get_file', { path: '/a' }, CTX);
    expect(isToolError(result)).toBe(false);
    expect(result).toMatchObject({
      ok: true,
      summary: 'MCP tool returned content.',
      content: { text: 'FILE BODY' },
    });
  });

  it('rejects invalid args at the gateway (ajv) without calling the server', async () => {
    const client = new FakeClient();
    const conn = new McpConnection(CONFIG, {
      client,
      transport: stubTransport,
      mapper: new NameMapper(),
    });
    await conn.connect();
    const result = await ToolGateway.invoke('mcpfiles_get_file', { path: 123 }, CTX);
    expect(isToolError(result)).toBe(true);
    expect((result as ToolError).code).toBe('VALIDATION_ERROR');
    expect(client.calls).not.toHaveBeenCalled();
  });

  it("unregisters the server's tools on disconnect", async () => {
    const mapper = new NameMapper();
    const conn = new McpConnection(CONFIG, {
      client: new FakeClient(),
      transport: stubTransport,
      mapper,
    });
    await conn.connect();
    await conn.disconnect();
    expect(CapabilityRegistry.get('mcpfiles_get_file')).toBeUndefined();
    expect(mapper.resolve('mcpfiles_get_file')).toBeUndefined();
  });
});
