import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The nav handler fires `void inject(...)`; let its await chain settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * `VideoPlayerPageInjector` — the CDP bridge that offers the Unified Player on eligible pages. Pinned:
 * `start` wires one `TabManager.onNavigation` handler; a navigation to an active page attaches the
 * debugger + evaluates the bootstrap + set-enabled(true, skinOptions); a destroyed / inactive tab is
 * skipped; the `Runtime.bindingCalled` listener validates the payload (method / binding / shape /
 * origin all gate it), injects the heavy bundle then rescans on `needBundle`, and broadcasts the
 * page-state to every live window ONLY for the active tab; and `refreshActive` re-injects + applies
 * options for an eligible active tab, else disables it (clearing the broadcast state).
 */

const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

vi.mock('./video-player-page-injector-script.electron', () => ({
  VIDEO_PLAYER_BOOTSTRAP: 'BOOT;',
}));
vi.mock('./video-player-embed-bundle.electron', () => ({ VIDEO_PLAYER_EMBED_JS: 'EMBED;' }));

const host = vi.hoisted(() => ({
  isActiveForPage: vi.fn(() => true),
  skinOptions: vi.fn(() => ({ theme: 'dark' })),
}));
vi.mock('./video-player-host.electron', () => ({ default: host }));

const tab = vi.hoisted((): { active: unknown; nav?: (url: string, wc: unknown) => void } => ({
  active: null,
}));
vi.mock('../tabs', () => ({
  default: {
    activeWebContents: () => tab.active,
    onNavigation: (fn: (url: string, wc: unknown) => void) => {
      tab.nav = fn;
    },
  },
}));

const windows = vi.hoisted(
  (): {
    list: { isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } }[];
  } => ({
    list: [],
  }),
);
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => windows.list },
}));
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels: { videoPlayerPageState: 'vp:state' } }));

type Listener = (e: unknown, method: string, params?: unknown) => void;
function fakeWc(url = 'https://video.test/watch') {
  const dbg = {
    isAttached: vi.fn(() => false),
    attach: vi.fn(),
    sendCommand: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  return {
    debugger: dbg,
    getURL: vi.fn(() => url),
    isDestroyed: vi.fn(() => false),
    executeJavaScript: vi.fn(() => Promise.resolve()),
    once: vi.fn(),
  };
}
type FakeWc = ReturnType<typeof fakeWc>;

let injector: typeof import('./video-player-page-injector.electron').default;
let getState: typeof import('./video-player-page-injector.electron').getVideoPlayerPageState;
beforeEach(async () => {
  vi.clearAllMocks();
  host.isActiveForPage.mockReturnValue(true);
  host.skinOptions.mockReturnValue({ theme: 'dark' });
  tab.active = null;
  windows.list = [];
  vi.resetModules();
  const mod = await import('./video-player-page-injector.electron');
  injector = mod.default;
  getState = mod.getVideoPlayerPageState;
});

async function navTo(url: string, wc: FakeWc): Promise<void> {
  injector.start();
  tab.nav!(url, wc);
  await flush();
}
const bindingListener = (wc: FakeWc): Listener =>
  wc.debugger.on.mock.calls.find((c) => c[0] === 'message')![1] as Listener;
const call = (payload: string) =>
  [{}, 'Runtime.bindingCalled', { name: '__tepegozVideoPlayerPost', payload }] as const;

describe('start + inject', () => {
  it('wires one nav handler and, on an active page, bootstraps + enables with skin options', async () => {
    injector.start();
    injector.start();
    const wc = fakeWc();
    tab.nav!('https://video.test/watch', wc);
    await flush();
    expect(wc.debugger.attach).toHaveBeenCalledWith('1.3');
    expect(wc.executeJavaScript).toHaveBeenCalledWith('BOOT;', true);
    expect(wc.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('__tepegozVideoPlayerSetEnabled(true,{"theme":"dark"})'),
      true,
    );
  });

  it('skips a destroyed or inactive tab', async () => {
    const dead = fakeWc();
    dead.isDestroyed.mockReturnValue(true);
    await navTo('https://video.test/', dead);
    expect(dead.debugger.attach).not.toHaveBeenCalled();

    host.isActiveForPage.mockReturnValue(false);
    const off = fakeWc();
    await navTo('https://video.test/', off);
    expect(off.debugger.attach).not.toHaveBeenCalled();
  });

  it('logs a warning when the debugger setup throws', async () => {
    const wc = fakeWc();
    wc.debugger.attach.mockImplementation(() => {
      throw new Error('no debugger');
    });
    await navTo('https://video.test/', wc);
    expect(logger.warn).toHaveBeenCalledWith(
      'Video player page injection failed',
      expect.objectContaining({ err: expect.stringContaining('no debugger') as string }),
    );
  });

  it('attaches the binding listener only once per WebContents', async () => {
    const wc = fakeWc();
    await navTo('https://video.test/a', wc);
    await navTo('https://video.test/b', wc);
    expect(wc.debugger.on).toHaveBeenCalledTimes(1);
  });
});

describe('the Runtime.bindingCalled listener', () => {
  it('broadcasts the page state to every live window for the ACTIVE tab', async () => {
    const wc = fakeWc();
    tab.active = wc;
    const live = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    const dead = { isDestroyed: () => true, webContents: { send: vi.fn() } };
    windows.list = [live, dead];
    await navTo('https://video.test/watch', wc);

    bindingListener(wc)(...call(JSON.stringify({ url: 'https://video.test/watch', adopted: 2 })));
    expect(live.webContents.send).toHaveBeenCalledWith('vp:state', {
      url: 'https://video.test/watch',
      origin: 'https://video.test',
      adopted: 2,
      updatedAt: expect.any(Number) as number,
    });
    expect(dead.webContents.send).not.toHaveBeenCalled();
    expect(getState()).toMatchObject({ adopted: 2 });
  });

  it('injects the embed bundle then rescans when needBundle is set', async () => {
    const wc = fakeWc();
    tab.active = wc;
    await navTo('https://video.test/watch', wc);
    wc.executeJavaScript.mockClear();
    bindingListener(wc)(
      ...call(JSON.stringify({ url: 'https://video.test/watch', needBundle: true })),
    );
    await flush();
    expect(wc.executeJavaScript).toHaveBeenCalledWith('EMBED;', true);
    expect(wc.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('__tepegozVideoPlayerRescan'),
      true,
    );
  });

  it('ignores a non-binding method, wrong binding, malformed payload, and a non-web origin', async () => {
    const wc = fakeWc();
    tab.active = wc;
    windows.list = [{ isDestroyed: () => false, webContents: { send: vi.fn() } }];
    await navTo('https://video.test/watch', wc);
    const l = bindingListener(wc);
    l({}, 'Runtime.consoleAPICalled', { name: '__tepegozVideoPlayerPost', payload: '{}' });
    l(...([{}, 'Runtime.bindingCalled', { name: 'other', payload: '{}' }] as const));
    l(...call('not json'));
    wc.getURL.mockReturnValue('about:blank');
    l(...call(JSON.stringify({ url: 'x' })));
    expect(windows.list[0]!.webContents.send).not.toHaveBeenCalled();
  });

  it('does not broadcast for a non-active tab', async () => {
    const wc = fakeWc();
    tab.active = fakeWc(); // a different wc is active
    windows.list = [{ isDestroyed: () => false, webContents: { send: vi.fn() } }];
    await navTo('https://video.test/watch', wc);
    bindingListener(wc)(...call(JSON.stringify({ url: 'https://video.test/watch' })));
    expect(windows.list[0]!.webContents.send).not.toHaveBeenCalled();
  });

  it('an unparseable page URL resolves to a null origin and is not broadcast', async () => {
    const wc = fakeWc();
    tab.active = wc;
    windows.list = [{ isDestroyed: () => false, webContents: { send: vi.fn() } }];
    await navTo('https://video.test/watch', wc);
    wc.getURL.mockReturnValue('::: not a url :::');
    bindingListener(wc)(...call(JSON.stringify({ url: 'x' })));
    expect(windows.list[0]!.webContents.send).not.toHaveBeenCalled();
  });
});

describe('per-tab listener teardown', () => {
  it('the destroyed handler removes the message listener and forgets the wc', async () => {
    const wc = fakeWc();
    await navTo('https://video.test/watch', wc);
    const onDestroyed = wc.once.mock.calls.find((c) => c[0] === 'destroyed')?.[1] as () => void;
    const listener = bindingListener(wc);

    onDestroyed();
    expect(wc.debugger.removeListener).toHaveBeenCalledWith('message', listener);

    await navTo('https://video.test/2', wc); // forgotten → re-arms
    expect(wc.debugger.on).toHaveBeenCalledTimes(2);
  });

  it('the destroyed handler leaves an already-destroyed debugger untouched', async () => {
    const wc = fakeWc();
    await navTo('https://video.test/watch', wc);
    const onDestroyed = wc.once.mock.calls.find((c) => c[0] === 'destroyed')?.[1] as () => void;

    wc.isDestroyed.mockReturnValue(true);
    onDestroyed();

    expect(wc.debugger.removeListener).not.toHaveBeenCalled();
  });
});

describe('refreshActive', () => {
  it('re-injects and applies options for an eligible active tab', async () => {
    const wc = fakeWc();
    tab.active = wc;
    await injector.refreshActive();
    expect(wc.executeJavaScript).toHaveBeenCalledWith('BOOT;', true);
    expect(wc.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('__tepegozVideoPlayerApplyOptions'),
      true,
    );
  });

  it('disables the player and clears the broadcast state for a no-longer-eligible active tab', async () => {
    const wc = fakeWc();
    tab.active = wc;
    windows.list = [{ isDestroyed: () => false, webContents: { send: vi.fn() } }];
    host.isActiveForPage.mockReturnValue(false);
    await injector.refreshActive();
    expect(wc.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('__tepegozVideoPlayerSetEnabled(false)'),
      true,
    );
    expect(windows.list[0]!.webContents.send).toHaveBeenCalledWith('vp:state', null);
    expect(getState()).toBeNull();
  });

  it('is a no-op with no active tab', async () => {
    tab.active = null;
    await expect(injector.refreshActive()).resolves.toBeUndefined();
  });

  it('disableOn bails on a destroyed active tab', async () => {
    const wc = fakeWc();
    wc.isDestroyed.mockReturnValue(true);
    tab.active = wc;
    host.isActiveForPage.mockReturnValue(false);
    await injector.refreshActive();
    expect(wc.executeJavaScript).not.toHaveBeenCalled();
  });
});
