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
  readFile: vi.fn((): Promise<Buffer | string> => Promise.reject(new Error('ENOENT'))),
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

vi.mock('@tepegoz/libs', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));

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
});
