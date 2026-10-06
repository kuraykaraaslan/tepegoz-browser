import { vi } from 'vitest';

/**
 * Shared test kit for the `ipc-network` suites (`ipc-network*.electron.test.ts`).
 *
 * The bridge wires the binding service, the connection pool, the preference store, the secret vault,
 * Electron windows/dialogs and the tab manager, so each suite that drives it through `registerNetworkIpc`
 * needs the same fakes. They live here once; the `vi.mock(...)` factories stay in each spec because
 * `vi.mock` is hoisted per file. Test-only (imports `vitest`), loaded via `vi.hoisted`.
 */

export class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}

interface TestStage {
  status: 'pass' | 'fail' | 'skipped';
  detail: string | null;
}
interface TestResult {
  connectionId: string;
  configParse: TestStage;
  handshake: TestStage;
  reachability: 'notReached' | 'unverified';
}

export function createNetworkHarness() {
  const IpcChannels = {
    networkGetState: 'network:get-state',
    networkBindTab: 'network:bind-tab',
    networkBindGroup: 'network:bind-group',
    networkSetGeneral: 'network:set-general',
    networkAddConnection: 'network:add-connection',
    networkPickWireguard: 'network:pick-wireguard',
    networkSetActive: 'network:set-active',
    networkSetBinaryPath: 'network:set-binary-path',
    networkPickBinaryFolder: 'network:pick-binary-folder',
    networkRemoveConnection: 'network:remove-connection',
    networkNewIdentity: 'network:new-identity',
    networkTestConnection: 'network:test-connection',
    networkState: 'network:state',
  };

  const schemas = {
    AddNetworkConnectionSchema: { parse: vi.fn() },
    BindGroupNetworkSchema: { parse: vi.fn() },
    BindTabNetworkSchema: { parse: vi.fn() },
    RemoveNetworkConnectionSchema: { parse: vi.fn() },
    NewNetworkIdentitySchema: { parse: vi.fn() },
    SetBinaryPathSchema: { parse: vi.fn() },
    VpnBinarySchema: { parse: vi.fn() },
    SetConnectionActiveSchema: { parse: vi.fn() },
    SetGeneralBindingSchema: { parse: vi.fn() },
    TestNetworkConnectionSchema: { parse: vi.fn() },
  };

  const prefs = {
    getAll: vi.fn(() => ({ networkBinaries: { wireproxy: '', tor: '' } })),
    update: vi.fn(),
  };
  const bins = {
    binDir: () => '/drop-in',
    findBinaryInFolder: vi.fn((): string | null => null),
    locateBinary: vi.fn((): string => {
      throw new Error('not found');
    }),
  };
  const secrets = { isAvailable: vi.fn(() => true), save: vi.fn() };
  const tabs = {
    forWindow: vi.fn((): unknown => ({ getState: () => ({ tabs: [], groups: [] }) })),
    bindingStates: vi.fn((): { tabId: string; groupId: string | null }[] => []),
    reloadTab: vi.fn<(id: string) => void>(),
  };
  const binding = {
    prune: vi.fn(),
    resolveFor: vi.fn<
      (tabId: string) => { resolved: { connectionId: string | null }; source: string }
    >(() => ({ resolved: { connectionId: null }, source: 'default' })),
    resolveForGroup: vi.fn<(groupId: string) => { resolved: { connectionId: string | null } }>(
      () => ({
        resolved: { connectionId: null },
      }),
    ),
    mayEgress: vi.fn(() => true),
    general: vi.fn(() => ({ mode: 'direct' })),
    bindTab: vi.fn(() => Promise.resolve()),
    bindGroup: vi.fn(() => Promise.resolve()),
    setGeneral: vi.fn(() => Promise.resolve()),
    releaseConnection: vi.fn(() => Promise.resolve()),
  };
  const pool = {
    has: vi.fn<(id: string) => boolean>(() => false),
    get: vi.fn<(id: string) => unknown>(() => undefined),
    list: vi.fn(() => [] as unknown[]),
    add: vi.fn(),
    ensureUp: vi.fn(() => Promise.resolve()),
    takeDown: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    newIdentity: vi.fn(() => Promise.resolve({ reconnected: true })),
  };
  const connectionTest = {
    testConnection: vi.fn<(id: string) => Promise<TestResult>>(() =>
      Promise.resolve({
        connectionId: 'c1',
        configParse: { status: 'pass', detail: null },
        handshake: { status: 'pass', detail: null },
        reachability: 'unverified',
      }),
    ),
  };
  const backgroundConnections = { notifyEgressChange: vi.fn() };
  const readFileSync = vi.fn(() => '[Interface]\nPrivateKey=x');
  const bw = {
    fromWebContents: vi.fn((): unknown => null),
    getAllWindows: vi.fn(() => [] as unknown[]),
  };
  const dialog = {
    showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] as string[] })),
  };
  const appSurfaceContents = vi.fn((): unknown[] => []);

  const handlers = new Map<string, (e: unknown, p: unknown) => Promise<unknown>>();
  const handleAsync = (ch: string, fn: (e: unknown, p: unknown) => Promise<unknown>): void => {
    handlers.set(ch, fn);
  };

  const event = { sender: {} };
  /** Invoke a registered channel handler as the renderer would. */
  const call = (ch: string, payload?: unknown): Promise<unknown> =>
    handlers.get(ch)!(event, payload);

  /** The shared `beforeEach` body: clear every fake back to its default, ahead of `registerNetworkIpc()`. */
  const reset = (): void => {
    vi.clearAllMocks();
    bw.fromWebContents.mockReturnValue(null);
    bw.getAllWindows.mockReturnValue([]);
    appSurfaceContents.mockReturnValue([]);
    secrets.isAvailable.mockReturnValue(true);
    pool.has.mockReturnValue(false);
    pool.get.mockReturnValue(undefined);
    pool.list.mockReturnValue([]);
    tabs.forWindow.mockReturnValue({ getState: () => ({ tabs: [], groups: [] }) });
    tabs.bindingStates.mockReturnValue([]);
    prefs.getAll.mockReturnValue({ networkBinaries: { wireproxy: '', tor: '' } });
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    bins.locateBinary.mockImplementation(() => {
      throw new Error('not found');
    });
    bins.findBinaryInFolder.mockReturnValue(null);
    connectionTest.testConnection.mockResolvedValue({
      connectionId: 'c1',
      configParse: { status: 'pass', detail: null },
      handshake: { status: 'pass', detail: null },
      reachability: 'unverified',
    });
  };

  return {
    AppError,
    IpcChannels,
    schemas,
    prefs,
    bins,
    secrets,
    tabs,
    binding,
    pool,
    connectionTest,
    backgroundConnections,
    readFileSync,
    bw,
    dialog,
    appSurfaceContents,
    handleAsync,
    call,
    reset,
  };
}
