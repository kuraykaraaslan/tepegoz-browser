import { describe, expect, it } from 'vitest';
import { McpServerConfigSchema } from './config';

/**
 * `McpServerConfigSchema` — the normalized MCP server config the supervisor consumes, from either
 * source (user prefs or an extension manifest). The cross-field rule is the point: a `stdio` server
 * without a `command`, or an `http_sse` server without a `url`, must fail to parse rather than reach
 * the transport factory as a config that cannot connect.
 */

const stdio = {
  id: 'fs',
  label: 'Filesystem',
  transport: 'stdio' as const,
  command: 'mcp-fs',
  source: 'prefs' as const,
};

describe('McpServerConfigSchema', () => {
  it('parses a minimal stdio config and fills the defaults', () => {
    expect(McpServerConfigSchema.parse(stdio)).toEqual({
      ...stdio,
      args: [],
      env: {},
      enabled: true,
    });
  });

  it('parses a full http_sse config (forward-compat — transport factory still throws until 1b)', () => {
    expect(
      McpServerConfigSchema.parse({
        id: 'remote',
        label: 'Remote',
        transport: 'http_sse',
        url: 'https://mcp.example/sse',
        enabled: false,
        source: 'extension',
      }),
    ).toMatchObject({ transport: 'http_sse', url: 'https://mcp.example/sse', enabled: false });
  });

  it('rejects a stdio config with no command (the cross-field rule)', () => {
    const r = McpServerConfigSchema.safeParse({ ...stdio, command: undefined });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['command']);
  });

  it('rejects a stdio config with an empty command', () => {
    expect(McpServerConfigSchema.safeParse({ ...stdio, command: '' }).success).toBe(false);
  });

  it('rejects an http_sse config with no url', () => {
    const r = McpServerConfigSchema.safeParse({
      id: 'r',
      label: 'R',
      transport: 'http_sse',
      source: 'prefs',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['url']);
  });

  it('rejects an unknown transport, a bad url, and a missing source', () => {
    expect(McpServerConfigSchema.safeParse({ ...stdio, transport: 'grpc' }).success).toBe(false);
    expect(
      McpServerConfigSchema.safeParse({
        id: 'r',
        label: 'R',
        transport: 'http_sse',
        url: 'not a url',
        source: 'prefs',
      }).success,
    ).toBe(false);
    expect(McpServerConfigSchema.safeParse({ ...stdio, source: undefined }).success).toBe(false);
  });

  it('caps args at 64 entries and env values at 4096 chars', () => {
    expect(
      McpServerConfigSchema.safeParse({ ...stdio, args: Array.from({ length: 65 }, () => 'a') })
        .success,
    ).toBe(false);
    expect(
      McpServerConfigSchema.safeParse({ ...stdio, env: { BIG: 'x'.repeat(4097) } }).success,
    ).toBe(false);
  });
});
