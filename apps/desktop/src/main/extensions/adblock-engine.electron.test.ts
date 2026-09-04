import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `AdblockEngineService` — the main-process @ghostery/adblocker wiring. Pinned: `init` registers the
 * before-request / headers-received / navigation hooks exactly once and kicks off the initial load;
 * the request hooks pass through untouched when there is no engine or the page is not adblock-active,
 * and record a blocked request (once per request id) when the engine cancels; navigation triggers a
 * best-effort cosmetic-CSS injection; and `refresh` rebuilds + caches the engine on success while a
 * fetch failure leaves the previous engine in place and reports the error.
 */

type Details = Record<string, unknown>;
type BeforeCb = (d: Details) => Promise<{ cancel?: boolean; redirectURL?: string }>;
type HeadersCb = (d: Details) => Promise<{ cancel?: boolean }>;
type Wc = { isDestroyed: () => boolean; insertCSS: (s: string, o: unknown) => Promise<void> };
type NavCb = (url: string, wc: Wc) => void;

const fsp = vi.hoisted(() => ({
  mkdir: vi.fn(() => Promise.resolve()),
  readFile: vi.fn<(p?: unknown, enc?: unknown) => Promise<Buffer | string>>(() =>
    Promise.reject(new Error('ENOENT')),
  ),
  rename: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}));
vi.mock('node:fs/promises', () => fsp);

vi.mock('electron', () => ({ app: { getPath: () => '/userData' } }));

const engine = vi.hoisted(() => ({
  onBeforeRequest: vi.fn((_d: unknown, cb: (r: unknown) => void) => {
    cb({ cancel: true });
  }),
  onHeadersReceived: vi.fn((_d: unknown, cb: (r: unknown) => void) => {
    cb({ cancel: true });
  }),
  getCosmeticsFilters: vi.fn(() => ({ active: true, styles: '.ad{display:none}' })),
  serialize: vi.fn(() => new Uint8Array([1, 2, 3])),
}));
const ElectronBlocker = vi.hoisted(() => ({
  deserialize: vi.fn((): unknown => {
    throw new Error('no cache');
  }),
  fromPrebuiltAdsAndTracking: vi.fn((): Promise<unknown> => Promise.resolve(engine)),
}));
vi.mock('@ghostery/adblocker-electron', () => ({ ElectronBlocker }));

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const host = vi.hoisted(() => ({
  recordBlocked: vi.fn(),
  isActiveForPage: vi.fn(() => true),
  setEngineStatus: vi.fn(),
  get: vi.fn(() => ({ cosmeticFiltering: true })),
  setLastUpdatedAt: vi.fn(),
  canRefreshManual: vi.fn(() => true),
  markManualRefreshAttempt: vi.fn(),
}));
vi.mock('./adblock-host.electron', () => ({ default: host }));

const tabs = vi.hoisted(() => ({ onNavigation: vi.fn<(cb: NavCb) => void>() }));
vi.mock('../tabs', () => ({ default: tabs }));

const wrs = vi.hoisted(() => ({
  onBeforeRequest: vi.fn<(name: string, cb: BeforeCb) => void>(),
  onHeadersReceived: vi.fn<(name: string, cb: HeadersCb) => void>(),
}));
vi.mock('../web-request/browsing-web-request-service.electron', () => ({ default: wrs }));

const Svc = (await import('./adblock-engine.electron')).default;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const details = (over: Details = {}): Details => ({
  id: 1,
  url: 'https://ads.example/x',
  resourceType: 'script',
  referrer: 'https://site.test/',
  ...over,
});

beforeEach(() => {
  Svc.resetForTests();
  vi.clearAllMocks();
  fsp.readFile.mockRejectedValue(new Error('ENOENT'));
  ElectronBlocker.deserialize.mockImplementation(() => {
    throw new Error('no cache');
  });
  ElectronBlocker.fromPrebuiltAdsAndTracking.mockResolvedValue(engine);
  host.isActiveForPage.mockReturnValue(true);
  host.canRefreshManual.mockReturnValue(true);
  host.get.mockReturnValue({ cosmeticFiltering: true });
});

describe('init', () => {
  it('registers each hook once and starts the initial load', async () => {
    Svc.init();
    Svc.init();
    expect(wrs.onBeforeRequest).toHaveBeenCalledTimes(1);
    expect(wrs.onHeadersReceived).toHaveBeenCalledTimes(1);
    expect(tabs.onNavigation).toHaveBeenCalledTimes(1);
    await flush();
    // no cache -> falls through to a rebuild
    expect(ElectronBlocker.fromPrebuiltAdsAndTracking).toHaveBeenCalled();
  });
});

describe('the before-request hook', () => {
  const armed = async (): Promise<BeforeCb> => {
    Svc.init();
    await flush();
    return wrs.onBeforeRequest.mock.calls[0]![1];
  };

  it('passes through untouched when the page is not adblock-active', async () => {
    const cb = await armed();
    host.isActiveForPage.mockReturnValue(false);
    expect(await cb(details({ id: 7 }))).toEqual({});
    expect(host.recordBlocked).not.toHaveBeenCalled();
  });

  it('records a blocked request once per id when the engine cancels', async () => {
    const cb = await armed();
    const d = details({ id: 42 });
    expect(await cb(d)).toEqual({ cancel: true });
    await cb(d);
    expect(host.recordBlocked).toHaveBeenCalledTimes(1);
    expect(host.recordBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://ads.example/x', resourceType: 'script' }),
    );
  });
});

describe('the headers-received hook', () => {
  it('records a blocked request when the engine cancels', async () => {
    Svc.init();
    await flush();
    const cb = wrs.onHeadersReceived.mock.calls[0]![1];
    expect(await cb(details({ id: 5, resourceType: 'mainFrame' }))).toEqual({ cancel: true });
    expect(host.recordBlocked).toHaveBeenCalledTimes(1);
  });
});

describe('navigation', () => {
  it('injects cosmetic CSS for an active web page', async () => {
    Svc.init();
    await flush();
    const nav = tabs.onNavigation.mock.calls[0]![0];
    const wc: Wc = { isDestroyed: () => false, insertCSS: vi.fn(() => Promise.resolve()) };
    nav('https://site.test/', wc);
    await flush();
    expect(wc.insertCSS).toHaveBeenCalledWith('.ad{display:none}', { cssOrigin: 'user' });
  });
});

describe('refresh', () => {
  it('does nothing on a manual refresh the host has rate-limited', async () => {
    host.canRefreshManual.mockReturnValue(false);
    await Svc.refresh({ manual: true });
    expect(ElectronBlocker.fromPrebuiltAdsAndTracking).not.toHaveBeenCalled();
  });

  it('rebuilds, writes the cache atomically, and marks the engine ready', async () => {
    await Svc.refresh({ manual: false });
    expect(ElectronBlocker.fromPrebuiltAdsAndTracking).toHaveBeenCalledTimes(1);
    expect(fsp.writeFile).toHaveBeenCalledTimes(2);
    expect(fsp.rename).toHaveBeenCalledTimes(2);
    expect(host.setLastUpdatedAt).toHaveBeenCalledWith(expect.any(Number) as number);
    expect(host.setEngineStatus).toHaveBeenLastCalledWith('ready', null);
  });

  it('keeps the previous engine and reports the error when the fetch fails', async () => {
    ElectronBlocker.fromPrebuiltAdsAndTracking.mockRejectedValueOnce(new Error('network down'));
    await Svc.refresh({ manual: false });
    expect(fsp.rename).not.toHaveBeenCalled();
    expect(host.setEngineStatus).toHaveBeenLastCalledWith(
      'error',
      expect.stringContaining('network down') as string,
    );
  });

  it('a second refresh while one is in flight awaits the first instead of starting another', async () => {
    let release!: (v: unknown) => void;
    ElectronBlocker.fromPrebuiltAdsAndTracking.mockReturnValueOnce(
      new Promise((r) => {
        release = r;
      }),
    );
    const p1 = Svc.refresh({ manual: false });
    const p2 = Svc.refresh({ manual: false }); // refreshPromise !== null -> await + return
    release(engine);
    await Promise.all([p1, p2]);
    expect(ElectronBlocker.fromPrebuiltAdsAndTracking).toHaveBeenCalledTimes(1);
  });
});

describe('cache + initial load', () => {
  const cachedInit = async (lastUpdatedAt: number | null): Promise<void> => {
    fsp.readFile.mockImplementation((p: unknown) =>
      String(p).includes('metadata')
        ? Promise.resolve(JSON.stringify({ lastUpdatedAt }))
        : Promise.resolve(Buffer.from([9, 9, 9])),
    );
    ElectronBlocker.deserialize.mockReturnValue(engine);
    Svc.init();
    await flush();
  };

  it('restores the engine from cache and skips the rebuild when the cache is fresh', async () => {
    await cachedInit(Date.now());
    expect(ElectronBlocker.deserialize).toHaveBeenCalled();
    expect(host.setEngineStatus).toHaveBeenCalledWith('ready', null);
    expect(logger.info).toHaveBeenCalledWith('Adblock engine restored from cache');
    expect(ElectronBlocker.fromPrebuiltAdsAndTracking).not.toHaveBeenCalled();
  });

  it('restores from cache but kicks a background rebuild when the cache is stale', async () => {
    await cachedInit(1); // epoch + 1 ms -> far outside the daily window
    expect(ElectronBlocker.deserialize).toHaveBeenCalled();
    expect(ElectronBlocker.fromPrebuiltAdsAndTracking).toHaveBeenCalledTimes(1);
  });

  it('treats a valid metadata file with a non-numeric lastUpdatedAt as "never updated"', async () => {
    await cachedInit(null); // JSON parses fine, but lastUpdatedAt is null -> the ternary's else arm
    expect(host.setLastUpdatedAt).toHaveBeenCalledWith(null);
    expect(ElectronBlocker.deserialize).toHaveBeenCalled();
    expect(ElectronBlocker.fromPrebuiltAdsAndTracking).toHaveBeenCalledTimes(1);
  });

  it('treats a corrupt metadata file as "never updated" and rebuilds', async () => {
    fsp.readFile.mockImplementation((p: unknown) =>
      String(p).includes('metadata')
        ? Promise.resolve('{ not json')
        : Promise.resolve(Buffer.from([9])),
    );
    ElectronBlocker.deserialize.mockReturnValue(engine);
    Svc.init();
    await flush();
    expect(host.setLastUpdatedAt).toHaveBeenCalledWith(null);
    expect(ElectronBlocker.fromPrebuiltAdsAndTracking).toHaveBeenCalled();
  });
});

describe('page-URL + source resolution in the request hooks', () => {
  const armed = async (): Promise<BeforeCb> => {
    Svc.init();
    await flush();
    return wrs.onBeforeRequest.mock.calls[0]![1];
  };

  it('uses the frame URL, and reports it as the source, when there is no referrer', async () => {
    const cb = await armed();
    await cb(details({ id: 200, referrer: '', frame: { url: 'https://frame.test/p' } }));
    expect(host.recordBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://frame.test/p',
        pageOrigin: 'https://frame.test',
      }),
    );
  });

  it('falls back to the live web-contents URL when there is neither referrer nor frame', async () => {
    const cb = await armed();
    await cb(
      details({
        id: 201,
        referrer: '',
        frame: undefined,
        webContents: { isDestroyed: () => false, getURL: () => 'https://wc.test/home' },
      }),
    );
    const arg = host.recordBlocked.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.pageOrigin).toBe('https://wc.test');
    expect(arg).not.toHaveProperty('sourceUrl');
  });

  it('leaves pageOrigin off when the resolved page URL will not parse', async () => {
    const cb = await armed();
    await cb(
      details({ id: 202, referrer: '', frame: undefined, webContents: undefined, url: 'not a url' }),
    );
    const arg = host.recordBlocked.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('pageOrigin');
  });

  it('evicts the oldest counted request id once the dedupe cap is exceeded', async () => {
    const cb = await armed();
    for (let i = 0; i < 5002; i += 1) await cb(details({ id: 10_000 + i }));
    host.recordBlocked.mockClear();
    await cb(details({ id: 10_000 })); // id 10000 was evicted -> counted afresh
    expect(host.recordBlocked).toHaveBeenCalledTimes(1);
  });
});

describe('cosmetic injection guards', () => {
  const navFn = async (): Promise<NavCb> => {
    Svc.init();
    await flush();
    return tabs.onNavigation.mock.calls[0]![0];
  };
  const liveWc = (): Wc => ({ isDestroyed: () => false, insertCSS: vi.fn(() => Promise.resolve()) });

  it('does nothing for a navigation URL that will not parse as a web URL', async () => {
    const nav = await navFn();
    const wc = liveWc();
    nav('not a url', wc); // isWebUrl throws -> caught -> false -> guarded out
    await flush();
    expect(wc.insertCSS).not.toHaveBeenCalled();
    expect(engine.getCosmeticsFilters).not.toHaveBeenCalled();
  });

  it('fails open (warns, no throw) when the cosmetics lookup throws', async () => {
    const nav = await navFn();
    engine.getCosmeticsFilters.mockImplementationOnce(() => {
      throw new Error('cosmetics boom');
    });
    const wc = liveWc();
    expect(() => {
      nav('https://site.test/', wc);
    }).not.toThrow();
    await flush();
    expect(logger.warn).toHaveBeenCalledWith(
      'Adblock cosmetic injection failed open',
      expect.objectContaining({ err: expect.stringContaining('cosmetics boom') as string }),
    );
  });
});

describe('engine dispatch errors surface as a rejected hook', () => {
  it('before-request: an engine that throws synchronously rejects the hook', async () => {
    Svc.init();
    await flush();
    const cb = wrs.onBeforeRequest.mock.calls[0]![1];
    engine.onBeforeRequest.mockImplementationOnce(() => {
      throw new Error('engine sync fail');
    });
    await expect(cb(details({ id: 300 }))).rejects.toThrow('engine sync fail');
  });

  it('headers-received: an engine that throws synchronously rejects the hook', async () => {
    Svc.init();
    await flush();
    const cb = wrs.onHeadersReceived.mock.calls[0]![1];
    engine.onHeadersReceived.mockImplementationOnce(() => {
      throw new Error('engine hdr fail');
    });
    await expect(cb(details({ id: 301, resourceType: 'mainFrame' }))).rejects.toThrow(
      'engine hdr fail',
    );
  });
});

describe('the daily refresh interval', () => {
  it('runs a background refresh when the interval fires', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    try {
      Svc.init();
      await flush();
      ElectronBlocker.fromPrebuiltAdsAndTracking.mockClear();
      const tick = spy.mock.calls[0]![0];
      tick();
      await flush();
      expect(ElectronBlocker.fromPrebuiltAdsAndTracking).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
