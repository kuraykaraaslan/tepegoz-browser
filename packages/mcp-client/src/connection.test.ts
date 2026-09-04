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

  /** A FakeClient with overridable listTools / callTool. */
  class FlexClient implements McpClientLike {
    onclose?: () => void;
    constructor(
      private readonly list: () => unknown,
      private readonly onCall: () => unknown = () => ({ content: [{ type: 'text', text: 'ok' }] }),
    ) {}
    connect(): Promise<void> {
      return Promise.resolve();
    }
    listTools(): Promise<unknown> {
      return Promise.resolve(this.list());
    }
    callTool(): Promise<unknown> {
      return Promise.resolve(this.onCall());
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }

  it('returns 0 and registers nothing when tools/list fails schema validation', async () => {
    const conn = new McpConnection(CONFIG, {
      client: new FlexClient(() => ({ not: 'a tool list' })),
      transport: stubTransport,
      mapper: new NameMapper(),
    });
    expect(await conn.connect()).toBe(0);
    expect(CapabilityRegistry.list()).toHaveLength(0);
  });

  it('truncates a server that advertises more than the per-server cap', async () => {
    const many = Array.from({ length: 130 }, (_, i) => ({
      name: `tool_${i}`,
      description: 'x',
      inputSchema: { type: 'object' as const },
    }));
    const conn = new McpConnection(CONFIG, {
      client: new FlexClient(() => ({ tools: many })),
      transport: stubTransport,
      mapper: new NameMapper(),
    });
    expect(await conn.connect()).toBe(128);
  });

  it('skips a single tool whose input schema exceeds the byte cap, keeping the rest', async () => {
    const huge = { type: 'object', properties: { blob: { enum: Array.from({ length: 20000 }, (_, i) => `v${i}`) } } };
    const conn = new McpConnection(CONFIG, {
      client: new FlexClient(() => ({
        tools: [
          { name: 'small_tool', description: 'x', inputSchema: { type: 'object' } },
          { name: 'huge_tool', description: 'x', inputSchema: huge },
        ],
      })),
      transport: stubTransport,
      mapper: new NameMapper(),
    });
    expect(await conn.connect()).toBe(1);
    const ids = CapabilityRegistry.list().map((d) => d.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toContain('small'); // the huge_tool was dropped, small_tool kept
  });

  it('wraps a server-side tools/call throw as a redacted AppError(502)', async () => {
    const conn = new McpConnection(CONFIG, {
      client: new FlexClient(
        () => ({ tools: [{ name: 'read_file', description: 'x', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] }),
        () => {
          throw new Error('/secret/path leaked in the message');
        },
      ),
      transport: stubTransport,
      mapper: new NameMapper(),
    });
    await conn.connect();
    const result = await ToolGateway.invoke('mcpfiles_get_file', {}, CTX);
    expect(isToolError(result)).toBe(true);
    expect((result as ToolError).message).not.toContain('/secret/path');
  });

  it('skips a tool whose synthetic id already exists in the registry (defense-in-depth), keeps going', async () => {
    // Pre-claim the id the mapper will assign for read_file.
    CapabilityRegistry.register({
      descriptor: {
        id: 'mcpfiles_get_file',
        description: 'squatter',
        dangerClass: 'read',
        source: 'builtin',
        inputSchema: { type: 'object' },
        requiresIdempotencyKey: false,
      },
      inputSchema: {
        safeParse: (d: unknown) =>
          typeof d === 'object' && d !== null
            ? { success: true as const, data: d }
            : { success: false as const, error: { issues: ['expected object'] } },
      },
      handler: () => ({ ok: true }),
    });
    const conn = new McpConnection(CONFIG, {
      client: new FlexClient(() => ({
        tools: [
          { name: 'read_file', description: 'x', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
          { name: 'delete_file', description: 'x', inputSchema: { type: 'object' }, annotations: { destructiveHint: true } },
        ],
      })),
      transport: stubTransport,
      mapper: new NameMapper(),
    });
    // read_file collides and is skipped; delete_file still registers → 1.
    expect(await conn.connect()).toBe(1);
  });

  it('exposes toolCount and swallows a close() that rejects on disconnect', async () => {
    const client = new FlexClient(() => ({
      tools: [{ name: 'read_file', description: 'x', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }],
    }));
    client.close = () => Promise.reject(new Error('transport already gone'));
    const conn = new McpConnection(CONFIG, { client, transport: stubTransport, mapper: new NameMapper() });
    await conn.connect();
    expect(conn.toolCount).toBe(1);
    await expect(conn.disconnect()).resolves.toBeUndefined();
  });

  it('carries structuredContent through on a successful call', async () => {
    const conn = new McpConnection(CONFIG, {
      client: new FlexClient(
        () => ({ tools: [{ name: 'read_file', description: 'x', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] }),
        () => ({ content: [{ type: 'text', text: 'body' }], structuredContent: { rows: 3 } }),
      ),
      transport: stubTransport,
      mapper: new NameMapper(),
    });
    await conn.connect();
    const result = await ToolGateway.invoke('mcpfiles_get_file', {}, CTX);
    expect(result).toMatchObject({ content: { text: 'body', structuredContent: { rows: 3 } } });
  });
});
