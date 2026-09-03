import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `CdpDriver` — the facade that owns the per-tab debugger attachment and lends it to the pure
 * `cdp-driver-*` helpers via `DriverCore` / `SnapshotDeps`. Pinned: `ensureAttached` attaches once (or
 * adopts an existing session), enables the CDP domains + focus emulation, and 409s a failed attach;
 * `detach` is best-effort; `resolveRef` walks the ref map (409 stale map, 404 unknown ref, path→identity
 * cascade); `assertSameOrigin` throws only on a proven navigation swap; and every action method
 * delegates to its `*Impl` with a `core` whose closures call back into the driver's shared state.
 */

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { warn: vi.fn(), info: vi.fn() } }));
vi.mock('@tepegoz/human-input', () => ({ HumanInputAdapter: class {} }));
vi.mock('./cdp-driver-schemas.electron.js', () => ({ LOAD_TIMEOUT_MS: 5000 }));

const isOriginSwap = vi.hoisted(() => vi.fn(() => false));
vi.mock('@tepegoz/tool-executor', () => ({
  isOriginSwap,
  originOf: (u: string) => u,
  originSwapMessage: () => 'the page navigated away',
}));

const dom = vi.hoisted(() => ({
  locatorsToObjectId: vi.fn((): Promise<string | null> => Promise.resolve('obj-id')),
  pathToObjectId: vi.fn((): Promise<string> => Promise.resolve('obj-path')),
  readValue: vi.fn((): Promise<string | null> => Promise.resolve('the-value')),
}));
vi.mock('./cdp-driver-dom.electron.js', () => dom);

const dialogs = vi.hoisted(() => ({
  attachDialogInterceptor: vi.fn(),
  interceptionsSince: vi.fn(() => ['dialog']),
}));
vi.mock('./cdp-driver-dialogs.electron.js', () => dialogs);
const net = vi.hoisted(() => ({
  attachNetworkRecorder: vi.fn(),
  networkSince: vi.fn(() => ['obs']),
}));
vi.mock('./cdp-driver-network.electron.js', () => net);
const sessionMod = vi.hoisted(() => ({ waitForPageSettled: vi.fn(() => Promise.resolve()) }));
vi.mock('./cdp-driver-session.electron.js', () => sessionMod);

type Core = {
  ensure: (w: unknown) => Promise<void>;
  settle: (w: unknown) => Promise<void>;
  resolveRef: (w: unknown, r: number) => Promise<unknown>;
  assertSameOrigin: (w: unknown) => void;
};
const captured = vi.hoisted((): { deps?: Record<string, unknown>; core?: Core } => ({}));
vi.mock('./cdp-driver-snapshot.electron.js', () => ({
  snapshotElements: vi.fn(async (wc: object, deps: Record<string, unknown>) => {
    captured.deps = deps;
    await (deps.ensure as (w: object) => Promise<void>)(wc);
    (deps.refMaps as WeakMap<object, unknown>).set(
      wc,
      new Map<number, unknown>([
        [1, { backendNodeId: 5 }],
        [2, { path: ['0'], locators: { tag: 'a', role: 'link', name: 'x' } }],
      ]),
    );
    (deps.refOrigins as WeakMap<object, unknown>).set(wc, 'https://site.test/');
    return Promise.resolve({ url: 'https://site.test/', title: 'T', elements: [] });
  }),
}));

const impl = vi.hoisted(() => {
  const grab =
    (name: string, ret: unknown) =>
    (...args: unknown[]) => {
      captured.core = args[args.length - 1] as Core;
      return Promise.resolve(ret);
    };
  return {
    clickElement: vi.fn(grab('click', { occludedBy: null })),
    fillElement: vi.fn(grab('fill', { widget: null })),
    hoverElement: vi.fn(grab('hover', undefined)),
    pressKey: vi.fn(grab('press', { sent: 1, unsupported: [] })),
    sendKeys: vi.fn(grab('keys', { sent: 2, unsupported: [] })),
    scrollPage: vi.fn(grab('scroll', undefined)),
    selectOption: vi.fn(grab('select', { selected: 'A', options: ['A'] })),
    setFileInputFiles: vi.fn(grab('files', { accept: '*', multiple: false })),
  };
});
vi.mock('./cdp-driver-input.electron.js', () => impl);

const CdpDriver = (await import('./cdp-driver.electron')).default;

let attached: boolean;
let attachThrows: boolean;
const mkWc = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  debugger: {
    isAttached: vi.fn(() => attached),
    attach: vi.fn(() => {
      if (attachThrows) throw new Error('busy');
    }),
    detach: vi.fn(),
    sendCommand: vi.fn(() => Promise.resolve({})),
    once: vi.fn(),
  },
  once: vi.fn(),
  isDestroyed: () => false,
  getURL: () => 'https://site.test/',
  ...over,
});
const cast = <T>(v: unknown): T => v as T;
type Dbg = {
  isAttached: ReturnType<typeof vi.fn>;
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  sendCommand: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
};
const dbg = (wc: object): Dbg => (wc as { debugger: Dbg }).debugger;

beforeEach(() => {
  vi.clearAllMocks();
  attached = false;
  attachThrows = false;
  isOriginSwap.mockReturnValue(false);
  dom.pathToObjectId.mockResolvedValue('obj-path');
  dom.locatorsToObjectId.mockResolvedValue('obj-id');
});

describe('ensureAttached', () => {
  it('attaches once, subscribes the recorders, and enables the CDP domains', async () => {
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc));
    expect(dbg(wc).attach).toHaveBeenCalledWith('1.3');
    expect(net.attachNetworkRecorder).toHaveBeenCalledWith(wc);
    expect(dialogs.attachDialogInterceptor).toHaveBeenCalledWith(wc);
    const sent = dbg(wc).sendCommand.mock.calls.map((c: unknown[]): unknown => c[0]);
    expect(sent).toEqual(
      expect.arrayContaining([
        'DOM.enable',
        'Accessibility.enable',
        'Page.enable',
        'Runtime.enable',
        'Network.enable',
        'Emulation.setFocusEmulationEnabled',
      ]),
    );
  });

  it('is idempotent once attached', async () => {
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc));
    attached = true;
    await CdpDriver.snapshotElements(cast(wc));
    expect(dbg(wc).attach).toHaveBeenCalledTimes(1);
  });

  it('adopts an existing debugger session instead of attaching over it', async () => {
    attached = true;
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc));
    expect(dbg(wc).attach).not.toHaveBeenCalled();
    expect(net.attachNetworkRecorder).toHaveBeenCalled();
  });

  it('409s when the debugger cannot attach', async () => {
    attachThrows = true;
    const wc = mkWc();
    await expect(CdpDriver.readElementValue(cast(wc), 1)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('detach', () => {
  it('detaches an attached, live tab and swallows a teardown race', () => {
    const wc = mkWc();
    dbg(wc).isAttached.mockReturnValue(true);
    CdpDriver.detach(cast(wc));
    expect(dbg(wc).detach).toHaveBeenCalled();

    const wc2 = mkWc();
    dbg(wc2).isAttached.mockReturnValue(true);
    dbg(wc2).detach.mockImplementation(() => {
      throw new Error('gone');
    });
    expect(() => {
      CdpDriver.detach(cast(wc2));
    }).not.toThrow();
  });
});

describe('resolveRef (via readElementValue)', () => {
  it('409s when the tab has no ref map yet', async () => {
    const wc = mkWc();
    await expect(CdpDriver.readElementValue(cast(wc), 1)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('returns the value for a backendNodeId-backed ref', async () => {
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc));
    expect(await CdpDriver.readElementValue(cast(wc), 1)).toBe('the-value');
    expect(dom.readValue).toHaveBeenCalledWith(wc, { backendNodeId: 5 });
  });

  it('404s an unknown ref', async () => {
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc));
    await expect(CdpDriver.readElementValue(cast(wc), 99)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('falls back from a stale path to the identity locator', async () => {
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc));
    dom.pathToObjectId.mockRejectedValue(new Error('stale'));
    await CdpDriver.readElementValue(cast(wc), 2);
    expect(dom.locatorsToObjectId).toHaveBeenCalled();
    expect(dom.readValue).toHaveBeenCalledWith(wc, { objectId: 'obj-id' });
  });

  it('409s when neither the path nor the identity locator resolves', async () => {
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc));
    dom.pathToObjectId.mockRejectedValue(new Error('stale'));
    dom.locatorsToObjectId.mockResolvedValue(null);
    await expect(CdpDriver.readElementValue(cast(wc), 2)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('the action delegators', () => {
  it('pass a working core to their *Impl', async () => {
    const wc = mkWc();
    await CdpDriver.clickElement(cast(wc), 1);
    expect(impl.clickElement).toHaveBeenCalled();
    const core = captured.core!;

    await core.ensure(wc);
    expect(dbg(wc).attach).toHaveBeenCalled();

    await core.settle(wc);
    expect(sessionMod.waitForPageSettled).toHaveBeenCalled();
  });

  it("assertSameOrigin (via core) is silent until there's a proven navigation swap", async () => {
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc)); // seeds refOrigins
    await CdpDriver.clickElement(cast(wc), 1);
    const core = captured.core!;

    expect(() => {
      core.assertSameOrigin(wc);
    }).not.toThrow();

    isOriginSwap.mockReturnValue(true);
    let thrown: unknown;
    try {
      core.assertSameOrigin(wc);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ statusCode: 409 });
  });

  it('fillElement / selectOption / pressKey / scrollPage forward to their impl', async () => {
    const wc = mkWc();
    expect(await CdpDriver.fillElement(cast(wc), 1, 'hi')).toEqual({ widget: null });
    expect(await CdpDriver.selectOption(cast(wc), 1, 'A')).toEqual({
      selected: 'A',
      options: ['A'],
    });
    expect(await CdpDriver.pressKey(cast(wc), 'Enter')).toEqual({ sent: 1, unsupported: [] });
    await CdpDriver.scrollPage(cast(wc), 'down');
    expect(impl.fillElement).toHaveBeenCalled();
    expect(impl.scrollPage).toHaveBeenCalled();
  });

  it('setFileInputFiles / hoverElement / sendKeys forward to their impl', async () => {
    const wc = mkWc();
    expect(await CdpDriver.setFileInputFiles(cast(wc), 1, ['a.png'])).toEqual({
      accept: '*',
      multiple: false,
    });
    await CdpDriver.hoverElement(cast(wc), 1);
    expect(await CdpDriver.sendKeys(cast(wc), 'Ctrl+A')).toEqual({ sent: 2, unsupported: [] });
    expect(impl.setFileInputFiles).toHaveBeenCalled();
    expect(impl.hoverElement).toHaveBeenCalled();
    expect(impl.sendKeys).toHaveBeenCalled();
  });
});

describe('the attachment teardown callbacks', () => {
  const handler = (fn: ReturnType<typeof vi.fn>, ev: string): (() => void) | undefined =>
    fn.mock.calls.find((c) => c[0] === ev)?.[1] as (() => void) | undefined;

  it("the debugger 'detach' handler drops the tab so the next snapshot re-attaches", async () => {
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc));
    expect(dbg(wc).attach).toHaveBeenCalledTimes(1);

    handler(dbg(wc).once, 'detach')!();

    await CdpDriver.snapshotElements(cast(wc));
    expect(dbg(wc).attach).toHaveBeenCalledTimes(2);
  });

  it("the webContents 'destroyed' handler also clears the tab's ref map", async () => {
    const wc = mkWc();
    await CdpDriver.snapshotElements(cast(wc));
    expect(await CdpDriver.readElementValue(cast(wc), 1)).toBe('the-value');

    handler(wc.once as ReturnType<typeof vi.fn>, 'destroyed')!();

    await expect(CdpDriver.readElementValue(cast(wc), 1)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('pass-through observers', () => {
  it('networkSince / interceptionsSince / waitForPageSettled delegate', async () => {
    const wc = mkWc();
    expect(CdpDriver.networkSince(cast(wc), 0)).toEqual(['obs']);
    expect(CdpDriver.interceptionsSince(cast(wc), 0)).toEqual(['dialog']);
    await CdpDriver.waitForPageSettled(cast(wc));
    expect(sessionMod.waitForPageSettled).toHaveBeenCalled();
  });
});
