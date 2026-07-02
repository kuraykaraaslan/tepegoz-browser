import { describe, it, expect } from 'vitest';
import { McpToolListSchema, McpToolResultSchema } from './schemas';

describe('MCP response schemas', () => {
  it('parses a well-formed tools/list', () => {
    const parsed = McpToolListSchema.safeParse({
      tools: [{ name: 'read_file', description: 'reads', inputSchema: { type: 'object' } }],
    });
    expect(parsed.success).toBe(true);
  });

  it('defaults a missing tool description to empty string', () => {
    const parsed = McpToolListSchema.safeParse({ tools: [{ name: 'x', inputSchema: {} }] });
    expect(parsed.success && parsed.data.tools[0]?.description).toBe('');
  });

  it('rejects a tool with no name', () => {
    expect(McpToolListSchema.safeParse({ tools: [{ inputSchema: {} }] }).success).toBe(false);
  });

  it('parses tool results and surfaces isError', () => {
    const ok = McpToolResultSchema.safeParse({ content: [{ type: 'text', text: 'hi' }] });
    expect(ok.success).toBe(true);
    const err = McpToolResultSchema.safeParse({ isError: true, content: [] });
    expect(err.success && err.data.isError).toBe(true);
  });
});
