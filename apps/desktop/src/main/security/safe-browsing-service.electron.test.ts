import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `SafeBrowsingService` — the runtime wiring that composes the prefix store, the full-hash client, the
 * Settings switch and the refresh scheduler into one `SafeBrowsingProvider`. Pinned: `init` loads the
 * store, starts the scheduler when a prefix-list fetcher exists (else just logs "no API key"), and is
 * idempotent; `stop` stops the scheduler; `checkNavigation` / `downloadTrustProvider` delegate to the
 * provider; and the scheduler's `refresh` closure prefers an incremental delta (falling back to a full
 * copy when the delta is rejected), else replaces from the list fetcher, else no-ops.
 */

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(() => Promise.resolve()),
  readFile: vi.fn(() => Promise.resolve('')),
  rename: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}));
vi.mock('electron', () => ({ app: { getPath: () => '/userData' } }));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const provider = vi.hoisted(() => ({
  checkNavigation: vi.fn(() => Promise.resolve({ decision: 'unknown' })),
  checkDownloadOrigin: vi.fn(() => Promise.resolve('unknown')),
}));
interface ProviderCfg {
  enabled: () => boolean;
  database: () => unknown;
  fetchFullHashes: () => unknown;
}
const providerConfig = vi.hoisted((): { c?: ProviderCfg } => ({}));
vi.mock('@tepegoz/security-policy', () => ({
  SafeBrowsingProvider: class {
    constructor(c: ProviderCfg) {
      providerConfig.c = c;
      return provider;
    }
  },
}));

const prefs = vi.hoisted(() => ({ getAll: vi.fn(() => ({ safeBrowsingEnabled: true })) }));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const store = vi.hoisted(() => ({
  load: vi.fn(() => Promise.resolve()),
  database: vi.fn((): unknown => ({ __db: true })),
  versionToken: vi.fn(() => 'v1'),
  applyDelta: vi.fn((): Promise<string> => Promise.resolve('applied')),
  replaceAll: vi.fn(() => Promise.resolve()),
  updatedAt: vi.fn(() => 0),
  count: vi.fn(() => 5),
}));
interface StoreIo {
  read: () => Promise<string | null>;
  write: (c: string) => Promise<void>;
}
const storeIo = vi.hoisted((): { io?: StoreIo } => ({}));
vi.mock('./safe-browsing-prefix-store', () => ({
  PrefixStore: class {
    constructor(io: StoreIo) {
      storeIo.io = io;
      return store;
    }
  },
}));

const fx = vi.hoisted((): { full: unknown; list: unknown; delta: unknown } => ({
  full: vi.fn(),
  list: vi.fn(() => Promise.resolve(['P'])),
  delta: null,
}));
vi.mock('./safe-browsing-v5-client', () => ({
  createFullHashFetcher: () => fx.full,
  createPrefixListFetcher: () => fx.list,
  createHashListDeltaFetcher: () => fx.delta,
}));

const sched = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
interface SchedCfg {
  refresh: () => Promise<void>;
  lastRefreshAt: () => number;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  enabled: () => boolean;
}
const schedConfig = vi.hoisted((): { c?: SchedCfg } => ({}));
vi.mock('./safe-browsing-refresh-scheduler', () => ({
  SafeBrowsingRefreshScheduler: class {
    start = sched.start;
    stop = sched.stop;
    constructor(c: SchedCfg) {
      schedConfig.c = c;
    }
  },
}));
vi.mock('./safe-browsing-config', () => ({ safeBrowsingApiKey: () => 'KEY' }));

type Mod = typeof import('./safe-browsing-service.electron');
async function load(): Promise<Mod['default']> {
  vi.resetModules();
  return (await import('./safe-browsing-service.electron')).default;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.database.mockReturnValue({ __db: true });
  store.versionToken.mockReturnValue('v1');
  store.applyDelta.mockResolvedValue('applied');
  prefs.getAll.mockReturnValue({ safeBrowsingEnabled: true });
  fx.full = vi.fn();
  fx.list = vi.fn(() => Promise.resolve(['P']));
  fx.delta = null;
});

describe('init', () => {
  it('loads the store and starts the scheduler when a prefix-list fetcher exists', async () => {
    const svc = await load();
    await svc.init();
    expect(store.load).toHaveBeenCalled();
    expect(sched.start).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Safe Browsing initialized', expect.anything());
  });

  it('logs "no API key" and does not start the scheduler without a list fetcher', async () => {
    fx.list = null;
    const svc = await load();
    await svc.init();
    expect(sched.start).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('no API key'));
  });

  it('is idempotent', async () => {
    const svc = await load();
    await svc.init();
    await svc.init();
    expect(store.load).toHaveBeenCalledTimes(1);
  });
});

describe('delegation', () => {
  it('stop / checkNavigation / downloadTrustProvider route to their collaborators', async () => {
    const svc = await load();
    svc.stop();
    expect(sched.stop).toHaveBeenCalled();

    await svc.checkNavigation('https://x.test/');
    expect(provider.checkNavigation).toHaveBeenCalledWith('https://x.test/');

    await svc.downloadTrustProvider().check({ sourceOrigin: 'https://o.test' } as never);
    expect(provider.checkDownloadOrigin).toHaveBeenCalledWith('https://o.test');
  });
});

describe('the scheduler refresh closure', () => {
  it('applies an incremental delta and stops there when it succeeds', async () => {
    fx.delta = vi.fn(() =>
      Promise.resolve({ partial: true, additions: ['a'], versionToken: 'v2' }),
    );
    await load();
    await schedConfig.c!.refresh();
    expect(store.applyDelta).toHaveBeenCalled();
    expect(store.replaceAll).not.toHaveBeenCalled();
  });

  it('takes a clean full copy when the delta is rejected', async () => {
    const delta = vi.fn();
    delta
      .mockResolvedValueOnce({ partial: true, additions: ['a'], versionToken: 'v2' })
      .mockResolvedValueOnce({ additions: ['x', 'y'], versionToken: 'v3' });
    fx.delta = delta;
    store.applyDelta.mockResolvedValue('rejected');
    await load();
    await schedConfig.c!.refresh();
    expect(delta).toHaveBeenCalledWith(null);
    expect(store.replaceAll).toHaveBeenCalledWith(['x', 'y'], expect.any(Number), 'v3');
  });

  it('replaces wholesale for a non-partial delta', async () => {
    fx.delta = vi.fn(() =>
      Promise.resolve({ partial: false, additions: ['z'], versionToken: 'v9' }),
    );
    await load();
    await schedConfig.c!.refresh();
    expect(store.replaceAll).toHaveBeenCalledWith(['z'], expect.any(Number), 'v9');
  });

  it('falls back to the list fetcher when there is no delta fetcher', async () => {
    fx.delta = null;
    fx.list = vi.fn(() => Promise.resolve(['L1', 'L2']));
    await load();
    await schedConfig.c!.refresh();
    expect(store.replaceAll).toHaveBeenCalledWith(['L1', 'L2'], expect.any(Number));
  });

  it('is a no-op when neither a delta nor a list fetcher is available', async () => {
    fx.delta = null;
    fx.list = null;
    await load();
    await schedConfig.c!.refresh();
    expect(store.replaceAll).not.toHaveBeenCalled();
  });

  it('asks for a full delta (null token) when a partial arrives but the store holds no set yet', async () => {
    store.database.mockReturnValue(null);
    const delta = vi.fn(() =>
      Promise.resolve({ partial: true, additions: ['a'], versionToken: 'v2' }),
    );
    fx.delta = delta;
    await load();
    await schedConfig.c!.refresh();
    // token is null (no DB) → the `partial && token !== null` guard is false → wholesale replace.
    expect(store.applyDelta).not.toHaveBeenCalled();
    expect(store.replaceAll).toHaveBeenCalledWith(['a'], expect.any(Number), 'v2');
  });
});

describe('the collaborator config closures', () => {
  it('the provider is wired to the live Settings switch, store DB and full-hash fetcher', async () => {
    await load();
    const c = providerConfig.c!;
    prefs.getAll.mockReturnValue({ safeBrowsingEnabled: false });
    expect(c.enabled()).toBe(false);
    prefs.getAll.mockReturnValue({ safeBrowsingEnabled: true });
    expect(c.enabled()).toBe(true);

    store.database.mockReturnValue({ __db: 'live' });
    expect(c.database()).toEqual({ __db: 'live' });
    expect(c.fetchFullHashes()).toBe(fx.full);
  });

  it('the prefix-store IO reads the on-disk file and returns null when it is absent', async () => {
    const fsp = await import('node:fs/promises');
    await load();
    const io = storeIo.io!;

    vi.mocked(fsp.readFile).mockResolvedValueOnce('{"prefixes":[]}');
    await expect(io.read()).resolves.toBe('{"prefixes":[]}');

    vi.mocked(fsp.readFile).mockRejectedValueOnce(new Error('ENOENT'));
    await expect(io.read()).resolves.toBeNull();
  });

  it('the prefix-store IO writes atomically — temp file then rename, under a mkdir -p', async () => {
    const fsp = await import('node:fs/promises');
    await load();
    await storeIo.io!.write('payload');
    expect(vi.mocked(fsp.mkdir)).toHaveBeenCalledWith(expect.stringContaining('safe-browsing'), {
      recursive: true,
    });
    const tmp = vi.mocked(fsp.writeFile).mock.calls[0]![0] as string;
    expect(tmp).toMatch(/prefixes\.json\.\d+\.tmp$/);
    expect(vi.mocked(fsp.rename)).toHaveBeenCalledWith(
      tmp,
      expect.stringContaining('prefixes.json'),
    );
  });

  it('the scheduler is wired to wall-clock time, the store timestamp, the Settings switch and an unref-ed timer', async () => {
    await load();
    const c = schedConfig.c!;
    store.updatedAt.mockReturnValue(1234);
    expect(c.lastRefreshAt()).toBe(1234);
    expect(typeof c.now()).toBe('number');

    const fn = vi.fn();
    const handle = c.setTimer(fn, 5);
    expect(handle).toBeDefined();
    expect(() => {
      c.clearTimer(handle);
    }).not.toThrow();

    prefs.getAll.mockReturnValue({ safeBrowsingEnabled: false });
    expect(c.enabled()).toBe(false);
  });
});

describe('init logging', () => {
  it('reports a zero prefix count when the store has no database yet', async () => {
    store.database.mockReturnValue(null);
    const svc = await load();
    await svc.init();
    expect(logger.info).toHaveBeenCalledWith(
      'Safe Browsing initialized',
      expect.objectContaining({ prefixDatabase: 0, fullHashResolution: true }) as object,
    );
  });
});
