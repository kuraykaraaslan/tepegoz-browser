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
vi.mock('@tepegoz/security-policy', () => ({
  SafeBrowsingProvider: class {
    constructor() {
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
vi.mock('./safe-browsing-prefix-store', () => ({
  PrefixStore: class {
    constructor() {
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
const schedConfig = vi.hoisted((): { c?: { refresh: () => Promise<void> } } => ({}));
vi.mock('./safe-browsing-refresh-scheduler', () => ({
  SafeBrowsingRefreshScheduler: class {
    start = sched.start;
    stop = sched.stop;
    constructor(c: { refresh: () => Promise<void> }) {
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
});
