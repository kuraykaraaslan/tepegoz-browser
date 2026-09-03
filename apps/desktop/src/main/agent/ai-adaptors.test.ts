import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ai-adaptors.ts` — folds the single CapabilityRegistry into the titled adaptor groups shown in
 * Settings → Cost & performance. Grouping is driven only by a tool's source / provenance / category
 * (no per-tool bespoke logic), so what's pinned is: builtin tools group by category (else the id
 * prefix) as `system`; extension tools group by extensionId, EXCEPT the built-in management host which
 * is a `system` "Extensions" group not a user extension; mcp tools group by server id and take the
 * server's label; groups sort system → extension → mcp then by title; and an mcp connection's state
 * comes from the live McpService status.
 */

vi.mock('@tepegoz/extension-host', () => ({ EXTENSION_HOST_ID: 'com.tepegoz.host' }));

const registryList = vi.hoisted(() => vi.fn(() => [] as unknown[]));
vi.mock('@tepegoz/capability-plane', () => ({ CapabilityRegistry: { list: registryList } }));

const mcpStatus = vi.hoisted(() =>
  vi.fn(() => [] as { id: string; label: string; state: string; error?: string }[]),
);
vi.mock('../mcp/supervisor.electron', () => ({ default: { getStatus: mcpStatus } }));

vi.mock('../../shared/extensions', () => ({
  manifestById: (id: string) => (id === 'com.acme.tool' ? { id } : undefined),
  extensionLabel: (m: { id: string }) => ({ name: `Acme (${m.id})` }),
}));

const { buildAiAdaptors, buildAdaptorConnections } = await import('./ai-adaptors');

const tool = (over: Record<string, unknown>) => ({
  id: 'browser_click',
  description: 'd',
  dangerClass: 'safe',
  source: 'builtin',
  requiresIdempotencyKey: false,
  ...over,
});

beforeEach(() => {
  registryList.mockReset().mockReturnValue([]);
  mcpStatus.mockReset().mockReturnValue([]);
});

describe('buildAiAdaptors — grouping', () => {
  it('groups a builtin tool by its category as a titled system adaptor', () => {
    registryList.mockReturnValue([tool({ id: 'browser_click', category: 'browser' })]);
    const [a] = buildAiAdaptors('en');
    expect(a).toMatchObject({ id: 'browser', kind: 'system', title: 'Browser' });
    expect(a?.actions).toHaveLength(1);
  });

  it('falls back to the id prefix when a builtin tool has no category', () => {
    registryList.mockReturnValue([tool({ id: 'journal_read', category: undefined })]);
    expect(buildAiAdaptors('en')[0]?.id).toBe('journal');
  });

  it('groups an extension tool by extensionId, titled from its manifest', () => {
    registryList.mockReturnValue([
      tool({ id: 'acme_do', source: 'extension', provenance: 'com.acme.tool' }),
    ]);
    expect(buildAiAdaptors('en')[0]).toMatchObject({
      id: 'com.acme.tool',
      kind: 'extension',
      title: 'Acme (com.acme.tool)',
      provenance: 'com.acme.tool',
    });
  });

  it('treats the built-in management host as a system "Extensions" group, not a user extension', () => {
    registryList.mockReturnValue([
      tool({ id: 'ext_manage', source: 'extension', provenance: 'com.tepegoz.host' }),
    ]);
    expect(buildAiAdaptors('en')[0]).toMatchObject({
      id: 'extensions',
      kind: 'system',
      title: 'Extensions',
    });
  });

  it('groups an mcp tool by server id and takes the server label', () => {
    mcpStatus.mockReturnValue([{ id: 'srv1', label: 'My MCP Server', state: 'ready' }]);
    registryList.mockReturnValue([tool({ id: 'mcp_x', source: 'mcp', provenance: 'srv1' })]);
    expect(buildAiAdaptors('en')[0]).toMatchObject({
      id: 'srv1',
      kind: 'mcp',
      title: 'My MCP Server',
    });
  });

  it('folds multiple tools of one group into a single adaptor', () => {
    registryList.mockReturnValue([
      tool({ id: 'browser_click', category: 'browser' }),
      tool({ id: 'browser_type', category: 'browser' }),
    ]);
    const adaptors = buildAiAdaptors('en');
    expect(adaptors).toHaveLength(1);
    expect(adaptors[0]?.actions).toHaveLength(2);
  });
});

describe('buildAiAdaptors — ordering', () => {
  it('sorts system before extension before mcp, then by title', () => {
    mcpStatus.mockReturnValue([{ id: 'srv1', label: 'Zeta MCP', state: 'ready' }]);
    registryList.mockReturnValue([
      tool({ id: 'mcp_x', source: 'mcp', provenance: 'srv1' }),
      tool({ id: 'acme_do', source: 'extension', provenance: 'com.acme.tool' }),
      tool({ id: 'browser_click', category: 'browser' }),
    ]);
    expect(buildAiAdaptors('en').map((a) => a.kind)).toEqual(['system', 'extension', 'mcp']);
  });
});

describe('buildAdaptorConnections', () => {
  it('maps an mcp connection state from the live McpService status', () => {
    mcpStatus.mockReturnValue([{ id: 'srv1', label: 'S', state: 'error' }]);
    registryList.mockReturnValue([tool({ id: 'mcp_x', source: 'mcp', provenance: 'srv1' })]);
    const conn = buildAdaptorConnections('en').find((c) => c.id === 'srv1');
    expect(conn?.state).toBe('error');
  });

  it('treats a connecting/idle MCP server as not_configured', () => {
    mcpStatus.mockReturnValue([{ id: 'srv1', label: 'S', state: 'connecting' }]);
    registryList.mockReturnValue([tool({ id: 'mcp_x', source: 'mcp', provenance: 'srv1' })]);
    expect(buildAdaptorConnections('en').find((c) => c.id === 'srv1')?.state).toBe(
      'not_configured',
    );
  });

  it('reports a local (system) adaptor as connected', () => {
    registryList.mockReturnValue([tool({ id: 'browser_click', category: 'browser' })]);
    expect(buildAdaptorConnections('en').find((c) => c.id === 'browser')?.state).toBe('connected');
  });

  it('surfaces a configured MCP server that has no registered tools yet', () => {
    mcpStatus.mockReturnValue([{ id: 'srv2', label: 'Standalone MCP', state: 'ready' }]);
    registryList.mockReturnValue([]); // srv2 comes only from McpService.getStatus()
    const conn = buildAdaptorConnections('en').find((c) => c.id === 'srv2');
    expect(conn).toMatchObject({
      id: 'srv2',
      label: 'Standalone MCP',
      kind: 'mcp',
      provider: 'MCP',
      state: 'connected',
      authKind: 'none',
      auditRequired: true,
    });
    expect(conn?.permissions[0]).toMatchObject({ capability: 'web', scopes: [], state: 'connected' });
  });

  it('carries an errored standalone MCP server’s message as the permission reason', () => {
    mcpStatus.mockReturnValue([
      { id: 'srv3', label: 'Broken MCP', state: 'error', error: 'handshake failed' },
    ]);
    registryList.mockReturnValue([]);
    const conn = buildAdaptorConnections('en').find((c) => c.id === 'srv3');
    expect(conn?.state).toBe('error');
    expect(conn?.permissions[0]).toMatchObject({ reason: 'handshake failed' });
  });
});
