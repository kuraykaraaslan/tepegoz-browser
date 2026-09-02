import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `McpService` — the main-process MCP supervisor singleton (ADR-0018). It wires the Node concretions
 * (SDK client + stdio transport) into the Electron-free `McpSupervisor`, sources configs from
 * prefs + enabled extensions, and never throws (it logs). Pinned: `start` is a one-shot that
 * constructs with the factories and feeds it the collected configs; every method is a safe no-op
 * before `start`; a constructor / reconcile failure is caught and logged; `stop` tears the singleton
 * down so a later `getStatus` reads empty again.
 */

const sup = vi.hoisted(
  (): {
    ctorArgs: unknown;
    ctorThrows: boolean;
    instance: {
      start: ReturnType<typeof vi.fn>;
      reconcile: ReturnType<typeof vi.fn>;
      status: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    };
  } => ({
    ctorArgs: undefined,
    ctorThrows: false,
    instance: {
      start: vi.fn(),
      reconcile: vi.fn(() => Promise.resolve()),
      status: vi.fn(() => [{ id: 's1', state: 'ready', toolCount: 2 }]),
      stop: vi.fn(() => Promise.resolve()),
    },
  }),
);
class McpSupervisorMock {
  constructor(args: unknown) {
    if (sup.ctorThrows) throw new Error('spawn failed');
    sup.ctorArgs = args;
  }
  start = sup.instance.start;
  reconcile = sup.instance.reconcile;
  status = sup.instance.status;
  stop = sup.instance.stop;
}
vi.mock('@tepegoz/mcp-client', () => ({ McpSupervisor: McpSupervisorMock }));

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const CONFIGS = [{ id: 'srv-a', source: 'prefs' }];
const mergeMcpConfigs = vi.hoisted(() => vi.fn(() => [{ id: 'srv-a', source: 'prefs' }]));
vi.mock('./config-source', () => ({ mergeMcpConfigs }));

vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => ({ mcpServers: [], extensions: [] }) },
}));
vi.mock('../../shared/extensions', () => ({ builtinManifests: () => [] }));
vi.mock('../lib/i18n-main', () => ({ mainLocale: () => 'en' }));
vi.mock('./transport.electron', () => ({
  createClient: vi.fn(() => ({ __client: true })),
  createTransport: vi.fn(() => ({ __transport: true })),
}));

async function load() {
  vi.resetModules();
  return (await import('./supervisor.electron')).default;
}

beforeEach(() => {
  vi.clearAllMocks();
  sup.ctorArgs = undefined;
  sup.ctorThrows = false;
  mergeMcpConfigs.mockReturnValue([{ id: 'srv-a', source: 'prefs' }]);
});

describe('before start()', () => {
  it('getStatus is [] and reconcile / stop are silent no-ops', async () => {
    const McpService = await load();
    expect(McpService.getStatus()).toEqual([]);
    await expect(McpService.reconcile()).resolves.toBeUndefined();
    await expect(McpService.stop()).resolves.toBeUndefined();
    expect(sup.instance.start).not.toHaveBeenCalled();
  });
});

describe('start()', () => {
  it('constructs the supervisor with the Node factories and feeds it the collected configs', async () => {
    const McpService = await load();
    McpService.start();
    const args = sup.ctorArgs as {
      clientFactory: unknown;
      transportFactory: unknown;
      onStatus: (s: unknown) => void;
    };
    expect(args.clientFactory).toBeTypeOf('function');
    expect(args.transportFactory).toBeTypeOf('function');
    expect(sup.instance.start).toHaveBeenCalledWith(CONFIGS);
  });

  it('is a one-shot — a second call does not reconstruct or re-start', async () => {
    const McpService = await load();
    McpService.start();
    McpService.start();
    expect(sup.instance.start).toHaveBeenCalledTimes(1);
  });

  it('the onStatus callback logs a redacted status line', async () => {
    const McpService = await load();
    McpService.start();
    const { onStatus } = sup.ctorArgs as { onStatus: (s: unknown) => void };
    onStatus({ id: 'srv-a', state: 'ready', toolCount: 3 });
    expect(logger.info).toHaveBeenCalledWith('MCP server status', {
      id: 'srv-a',
      state: 'ready',
      tools: 3,
    });
  });

  it('catches and logs a constructor failure instead of throwing', async () => {
    const McpService = await load();
    sup.ctorThrows = true;
    expect(() => McpService.start()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'MCP supervisor failed to start',
      expect.objectContaining({ err: expect.stringContaining('spawn failed') as string }),
    );
    expect(McpService.getStatus()).toEqual([]);
  });
});

describe('after start()', () => {
  it('getStatus returns the live supervisor snapshot', async () => {
    const McpService = await load();
    McpService.start();
    expect(McpService.getStatus()).toEqual([{ id: 's1', state: 'ready', toolCount: 2 }]);
  });

  it('reconcile re-feeds freshly collected configs', async () => {
    const McpService = await load();
    McpService.start();
    mergeMcpConfigs.mockReturnValue([{ id: 'srv-b', source: 'ext' }]);
    await McpService.reconcile();
    expect(sup.instance.reconcile).toHaveBeenCalledWith([{ id: 'srv-b', source: 'ext' }]);
  });

  it('a reconcile rejection is caught and logged', async () => {
    const McpService = await load();
    McpService.start();
    sup.instance.reconcile.mockRejectedValueOnce(new Error('nope'));
    await expect(McpService.reconcile()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'MCP supervisor reconcile failed',
      expect.objectContaining({ err: expect.stringContaining('nope') as string }),
    );
  });

  it('stop() tears the singleton down: it awaits stop and getStatus goes empty', async () => {
    const McpService = await load();
    McpService.start();
    await McpService.stop();
    expect(sup.instance.stop).toHaveBeenCalledTimes(1);
    expect(McpService.getStatus()).toEqual([]);
    await McpService.stop(); // idempotent
    expect(sup.instance.stop).toHaveBeenCalledTimes(1);
  });
});
