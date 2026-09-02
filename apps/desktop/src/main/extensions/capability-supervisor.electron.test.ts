import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ExtensionCapabilityService` — main-process wiring for the in-process extension capability plane
 * (ADR-0021). It hands the Electron-free `ExtensionCapabilitySupervisor` three concretions: a
 * `CapabilityRegistry` adapter, a prefs-backed `isEnabled` (with the reserved host id always on), and
 * an `ExtensionManagementHost` that reads/writes `PreferenceStore.extensions`. Pinned: `provide`
 * records an extension's capability ids and forwards to the supervisor; `start` is a one-shot that
 * adds the always-on management capabilities and reconciles; each registry-adapter and isEnabled
 * closure routes correctly; and the management host's list/get/setEnabled (including its 404s and the
 * reconcile-on-toggle).
 */

class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: logger }));

const registry = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  get: vi.fn((): unknown => undefined),
}));
vi.mock('@tepegoz/capability-plane', () => ({ CapabilityRegistry: registry }));

const sup = vi.hoisted(
  (): {
    ctor: unknown;
    provide: ReturnType<typeof vi.fn>;
    reconcile: ReturnType<typeof vi.fn>;
  } => ({
    ctor: undefined,
    provide: vi.fn(),
    reconcile: vi.fn(),
  }),
);
class ExtensionCapabilitySupervisorMock {
  constructor(opts: unknown) {
    sup.ctor = opts;
  }
  provide = sup.provide;
  reconcile = sup.reconcile;
}
vi.mock('@tepegoz/extension-host', () => ({
  ExtensionCapabilitySupervisor: ExtensionCapabilitySupervisorMock,
  extensionManagementCapabilities: () => ({ extensionId: '__mgmt', capabilities: [] }),
  EXTENSION_HOST_ID: '__host',
}));

const isExtensionEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/desktop-ipc', () => ({ isExtensionEnabled }));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ extensions: [{ id: 'ext-a', status: 'enabled' }] })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const MANIFESTS: Record<string, unknown> = {
  'ext-a': { id: 'ext-a', version: '1.2.0', permissions: ['tabs'] },
};
vi.mock('../../shared/extensions', () => ({
  builtinManifests: () => Object.values(MANIFESTS),
  manifestById: (id: string) => MANIFESTS[id],
  extensionLabel: (m: { id: string }) => ({ name: `Label:${m.id}` }),
}));
vi.mock('../lib/i18n-main', () => ({ mainLocale: () => 'en' }));

type Svc = typeof import('./capability-supervisor.electron').default;
async function load(): Promise<Svc> {
  vi.resetModules();
  return (await import('./capability-supervisor.electron')).default;
}

type Ctor = {
  registry: {
    register: (t: unknown) => void;
    unregister: (id: string) => void;
    has: (id: string) => boolean;
  };
  isEnabled: (extId: string) => boolean;
  log: (msg: string, meta?: unknown) => void;
};
const ctor = (): Ctor => sup.ctor as Ctor;

/** The ExtensionManagementHost handed to the supervisor by start(). */
type MgmtHost = {
  list: () => { id: string; capabilities: readonly string[]; enabled: boolean }[];
  get: (id: string) => { id: string } | undefined;
  setEnabled: (id: string, enabled: boolean) => { id: string };
};
function mgmtHost(): MgmtHost {
  const call = sup.provide.mock.calls.find(
    (c) => (c[0] as { extensionId: string }).extensionId === '__mgmt',
  );
  return call![1] as MgmtHost;
}

beforeEach(() => {
  vi.clearAllMocks();
  isExtensionEnabled.mockReturnValue(true);
  prefs.getAll.mockReturnValue({ extensions: [{ id: 'ext-a', status: 'enabled' }] });
  registry.get.mockReturnValue(undefined);
});

describe('the supervisor construction', () => {
  it('registry adapter routes to the CapabilityRegistry', async () => {
    await load();
    ctor().registry.register({ id: 't1' });
    expect(registry.register).toHaveBeenCalledWith({ id: 't1' });
    ctor().registry.unregister('t1');
    expect(registry.unregister).toHaveBeenCalledWith('t1');

    registry.get.mockReturnValue({ id: 't1' });
    expect(ctor().registry.has('t1')).toBe(true);
    registry.get.mockReturnValue(undefined);
    expect(ctor().registry.has('t1')).toBe(false);
  });

  it('isEnabled is always true for the reserved host id, else prefs-backed', async () => {
    await load();
    expect(ctor().isEnabled('__host')).toBe(true);
    expect(isExtensionEnabled).not.toHaveBeenCalled();

    isExtensionEnabled.mockReturnValue(false);
    expect(ctor().isEnabled('ext-a')).toBe(false);
    expect(isExtensionEnabled).toHaveBeenCalledWith([{ id: 'ext-a', status: 'enabled' }], 'ext-a');
  });

  it('log forwards to Logger.info', async () => {
    await load();
    ctor().log('hello', { k: 1 });
    expect(logger.info).toHaveBeenCalledWith('hello', { k: 1 });
  });
});

describe('provide / start / reconcile', () => {
  it('provide records the capability ids and forwards to the supervisor', async () => {
    const svc = await load();
    const set = {
      extensionId: 'ext-a',
      capabilities: [{ descriptor: { id: 'cap.x' } }, { descriptor: { id: 'cap.y' } }],
    };
    const host = { __h: true };
    svc.provide(set as never, host);
    expect(sup.provide).toHaveBeenCalledWith(set, host);

    // the recorded ids now surface through the management host's ExtensionInfo
    svc.start();
    expect(mgmtHost().get('ext-a')?.id).toBe('ext-a');
    expect(mgmtHost().list()[0]!.capabilities).toEqual(['cap.x', 'cap.y']);
  });

  it('start is a one-shot: adds the management capabilities + reconciles once', async () => {
    const svc = await load();
    svc.start();
    svc.start();
    const mgmtProvides = sup.provide.mock.calls.filter(
      (c) => (c[0] as { extensionId: string }).extensionId === '__mgmt',
    );
    expect(mgmtProvides).toHaveLength(1);
    expect(sup.reconcile).toHaveBeenCalledTimes(1);
  });

  it('reconcile delegates straight through', async () => {
    const svc = await load();
    svc.reconcile();
    expect(sup.reconcile).toHaveBeenCalledTimes(1);
  });
});

describe('the management host', () => {
  it('list maps every builtin manifest to an ExtensionInfo and drops the unknowns', async () => {
    const svc = await load();
    svc.start();
    const infos = mgmtHost().list();
    expect(infos.map((i) => i.id)).toEqual(['ext-a']);
    expect(infos[0]!.enabled).toBe(true);
  });

  it('get returns undefined for an id with no manifest', async () => {
    const svc = await load();
    svc.start();
    expect(mgmtHost().get('ghost')).toBeUndefined();
  });

  it('setEnabled writes the new status, keeps the other rows, and reconciles', async () => {
    const svc = await load();
    svc.start();
    prefs.getAll.mockReturnValue({
      extensions: [
        { id: 'ext-a', status: 'enabled' },
        { id: 'other', status: 'disabled' },
      ],
    });
    const info = mgmtHost().setEnabled('ext-a', false);
    expect(prefs.update).toHaveBeenCalledWith({
      extensions: [
        { id: 'other', status: 'disabled' },
        { id: 'ext-a', status: 'disabled' },
      ],
    });
    expect(sup.reconcile).toHaveBeenCalled();
    expect(info.id).toBe('ext-a');
  });

  it('setEnabled throws a 404 for an unknown extension', async () => {
    const svc = await load();
    svc.start();
    try {
      mgmtHost().setEnabled('ghost', true);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(404);
    }
  });
});
