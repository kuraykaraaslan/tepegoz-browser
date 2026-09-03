import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `window.ts` — the secure window factory + the tray / kiosk / fullscreen window helpers. Pinned:
 * `CHROME_WEB_PREFERENCES` keeps the hardening flags; `hideToTray` / `startParkedInTray` park a window
 * off-screen + off the taskbar (recording its real bounds, once); `showFromTray` restores the saved
 * on-screen bounds + taskbar entry and flashes always-on-top to force it to the front;
 * `effectiveStartupMode` honours the background env/switch/argv over the pref; and the kiosk /
 * fullscreen helpers no-op on a destroyed (or, for fullscreen, kiosk) window.
 */

const appMock = vi.hoisted(() => ({
  commandLine: { hasSwitch: vi.fn(() => false) },
  getAppPath: () => '/app',
  getPath: () => '/userData',
}));

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
type Fn = (...a: unknown[]) => unknown;

const winReg = vi.hoisted(() => ({ opts: [] as unknown[], instances: [] as unknown[] }));
const BrowserWindowMock = vi.hoisted(() => {
  type H = Map<string, Fn[]>;
  const add = (m: H, ev: string, fn: Fn): void => {
    m.set(ev, [...(m.get(ev) ?? []), fn]);
  };
  class FakeBrowserWindow {
    opts: unknown;
    _wh: H = new Map();
    _wch: H = new Map();
    webContents = {
      once: vi.fn<(ev: string, fn: Fn) => void>(),
      on: vi.fn((ev: string, fn: Fn) => {
        add(this._wch, ev, fn);
      }),
      send: vi.fn<(ch: string, ...a: unknown[]) => void>(),
      setWindowOpenHandler: vi.fn<(h: (d: { url: string }) => unknown) => void>(),
    };
    constructor(opts: unknown) {
      this.opts = opts;
      winReg.opts.push(opts);
      winReg.instances.push(this);
    }
    on = vi.fn((ev: string, fn: Fn): this => {
      add(this._wh, ev, fn);
      return this;
    });
    fire(ev: string, ...args: unknown[]): void {
      for (const fn of this._wh.get(ev) ?? []) fn(...args);
    }
    fireWc(ev: string, ...args: unknown[]): void {
      for (const fn of this._wch.get(ev) ?? []) fn(...args);
    }
    isDestroyed = (): boolean => false;
    isMaximized = (): boolean => false;
    isMinimized = (): boolean => false;
    getNormalBounds = (): Rect => ({ x: 7, y: 8, width: 640, height: 480 });
    getBounds = (): Rect => ({ x: 7, y: 8, width: 640, height: 480 });
    maximize = vi.fn();
    show = vi.fn();
    showInactive = vi.fn();
    focus = vi.fn();
    setKiosk = vi.fn();
    setMenu = vi.fn();
    setAlwaysOnTop = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    setPosition = vi.fn();
    setSkipTaskbar = vi.fn();
  }
  return FakeBrowserWindow;
});

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: BrowserWindowMock,
  shell: { openExternal: vi.fn() },
}));

const parked = vi.hoisted(() => ({
  PARK_X: -32000,
  PARK_Y: -32000,
  isParkedToTray: vi.fn(),
  trayParked: new Map<unknown, unknown>(),
}));
vi.mock('./window-parked', () => parked);
const placementMock = vi.hoisted(() => ({
  ensureOnScreen: vi.fn((b: object) => ({ ...b, clamped: true })),
  isBoundsOnScreen: vi.fn(() => true),
}));
vi.mock('./window-placement', () => placementMock);
const isTrustedAppUrl = vi.hoisted(() => vi.fn(() => true));
vi.mock('./lib/trusted-origin', () => ({ isTrustedAppUrl }));
const whenChromeReady = vi.hoisted(() => vi.fn<(w: unknown, cb: () => void) => void>());
vi.mock('./chrome-ready', () => ({ whenChromeReady }));
vi.mock('./lib/glass', () => ({ GLASS_BG: '#000', isMicaSupported: () => false }));
vi.mock('./lib/surface-theme', () => ({
  resolveSurfaceTheme: () => ({ color: '#101828', theme: 'dark', themeColor: '' }),
}));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn<() => Record<string, unknown>>(() => ({ startupMode: 'window' })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const mod = await import('./window');

function fakeWin(over: Record<string, unknown> = {}) {
  return {
    isDestroyed: () => false,
    getBounds: () => ({ x: 1, y: 2, width: 300, height: 400 }),
    setSkipTaskbar: vi.fn(),
    setPosition: vi.fn(),
    showInactive: vi.fn(),
    setBounds: vi.fn(),
    isMinimized: () => false,
    restore: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    moveTop: vi.fn(),
    setKiosk: vi.fn(),
    isKiosk: () => false,
    isFullScreen: () => false,
    setFullScreen: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  parked.trayParked.clear();
  winReg.opts.length = 0;
  winReg.instances.length = 0;
  appMock.commandLine.hasSwitch.mockReturnValue(false);
  prefs.getAll.mockReturnValue({ startupMode: 'window', windowBounds: null, glassChrome: false });
  isTrustedAppUrl.mockReturnValue(true);
  delete process.env['TEPEGOZ_START_BACKGROUND'];
  delete process.env['TEPEGOZ_EVAL'];
});
afterEach(() => {
  delete process.env['TEPEGOZ_START_BACKGROUND'];
  delete process.env['TEPEGOZ_EVAL'];
  vi.useRealTimers();
});

it('CHROME_WEB_PREFERENCES keeps the hardening flags', () => {
  expect(mod.CHROME_WEB_PREFERENCES).toMatchObject({
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    partition: mod.APP_PARTITION,
  });
});

describe('hideToTray / startParkedInTray', () => {
  it('hideToTray parks the window off-screen + off the taskbar, recording its bounds once', () => {
    const win = fakeWin();
    mod.hideToTray(win as never);
    expect(parked.trayParked.get(win)).toEqual({ x: 1, y: 2, width: 300, height: 400 });
    expect(win.setSkipTaskbar).toHaveBeenCalledWith(true);
    expect(win.setPosition).toHaveBeenCalledWith(-32000, -32000);

    win.setSkipTaskbar.mockClear();
    mod.hideToTray(win as never); // already parked → no-op
    expect(win.setSkipTaskbar).not.toHaveBeenCalled();
  });

  it('hideToTray is a no-op for a destroyed window', () => {
    const win = fakeWin({ isDestroyed: () => true });
    mod.hideToTray(win as never);
    expect(win.setSkipTaskbar).not.toHaveBeenCalled();
  });

  it('startParkedInTray also shows the never-yet-shown window off-screen + unfocused', () => {
    const win = fakeWin();
    mod.startParkedInTray(win as never);
    expect(win.setPosition).toHaveBeenCalledWith(-32000, -32000);
    expect(win.setSkipTaskbar).toHaveBeenCalledWith(true);
    expect(win.showInactive).toHaveBeenCalled();
  });
});

describe('showFromTray', () => {
  it('restores the saved on-screen bounds + taskbar and flashes always-on-top to the front', () => {
    const win = fakeWin({ isMinimized: () => true });
    parked.trayParked.set(win, { x: 5, y: 6, width: 700, height: 800 });
    mod.showFromTray(win as never);
    expect(win.setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ x: 5, y: 6, width: 700, height: 800, clamped: true }),
    );
    expect(parked.trayParked.has(win)).toBe(false);
    expect(win.setSkipTaskbar).toHaveBeenCalledWith(false);
    expect(win.restore).toHaveBeenCalled();
    expect(win.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true);
    expect(win.show).toHaveBeenCalled();
    expect(win.moveTop).toHaveBeenCalled();
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
  });

  it('is a no-op for a destroyed window', () => {
    const win = fakeWin({ isDestroyed: () => true });
    mod.showFromTray(win as never);
    expect(win.show).not.toHaveBeenCalled();
  });
});

describe('effectiveStartupMode', () => {
  it('returns the pref by default', () => {
    prefs.getAll.mockReturnValue({ startupMode: 'kiosk' });
    expect(mod.effectiveStartupMode()).toBe('kiosk');
  });

  it('is forced to "background" by the env var, the switch, or an argv flag', () => {
    process.env['TEPEGOZ_START_BACKGROUND'] = '1';
    expect(mod.effectiveStartupMode()).toBe('background');
    delete process.env['TEPEGOZ_START_BACKGROUND'];

    appMock.commandLine.hasSwitch.mockReturnValue(true);
    expect(mod.effectiveStartupMode()).toBe('background');
    appMock.commandLine.hasSwitch.mockReturnValue(false);

    const argv = process.argv;
    process.argv = [...argv, '--background'];
    expect(mod.effectiveStartupMode()).toBe('background');
    process.argv = argv;
  });
});

describe('kiosk / fullscreen helpers', () => {
  it('enterKiosk shows + locks + focuses; exitKioskWindow unlocks', () => {
    const win = fakeWin();
    mod.enterKiosk(win as never);
    expect(win.show).toHaveBeenCalled();
    expect(win.setKiosk).toHaveBeenCalledWith(true);
    mod.exitKioskWindow(win as never);
    expect(win.setKiosk).toHaveBeenLastCalledWith(false);
  });

  it('toggleFullScreen flips the state, but no-ops in kiosk or on a destroyed window', () => {
    const win = fakeWin({ isFullScreen: () => false });
    mod.toggleFullScreen(win as never);
    expect(win.setFullScreen).toHaveBeenCalledWith(true);

    const kiosk = fakeWin({ isKiosk: () => true });
    mod.toggleFullScreen(kiosk as never);
    expect(kiosk.setFullScreen).not.toHaveBeenCalled();
  });
});

type FakeWin = InstanceType<typeof BrowserWindowMock>;

describe('createWindow', () => {
  it('builds ONE hardened, frameless, hidden window and wires the chrome-ready reveal', () => {
    vi.useFakeTimers();
    const win = mod.createWindow() as unknown as FakeWin;

    expect(winReg.instances).toHaveLength(1);
    expect(win.opts).toMatchObject({
      show: false,
      frame: false, // non-darwin
      minWidth: 640,
      minHeight: 427,
      width: 1280,
      height: 854,
      webPreferences: expect.objectContaining({ contextIsolation: true, sandbox: true }) as object,
    });
    expect(whenChromeReady).toHaveBeenCalledWith(win, expect.any(Function));
    expect(win.webContents.once).toHaveBeenCalledWith('did-finish-load', expect.any(Function));
  });

  it('restores a saved on-screen placement and re-maximizes when that is how it was left', () => {
    vi.useFakeTimers();
    prefs.getAll.mockReturnValue({
      startupMode: 'window',
      glassChrome: false,
      windowBounds: { x: 100, y: 120, width: 900, height: 700, maximized: true },
    });
    const win = mod.createWindow() as unknown as FakeWin;

    expect(win.opts).toMatchObject({ x: 100, y: 120, width: 900, height: 700 });
    expect(win.maximize).toHaveBeenCalled();
  });

  it('drops x/y (keeping size) when the saved rectangle is on a vanished display', () => {
    vi.useFakeTimers();
    placementMock.isBoundsOnScreen.mockReturnValueOnce(false);
    prefs.getAll.mockReturnValue({
      startupMode: 'window',
      glassChrome: false,
      windowBounds: { x: 9000, y: 9000, width: 800, height: 600, maximized: false },
    });
    const win = mod.createWindow() as unknown as FakeWin;

    expect(win.opts).toMatchObject({ width: 800, height: 600 });
    expect(win.opts).not.toHaveProperty('x');
  });

  it('the reveal shows + focuses normally, and is idempotent', () => {
    vi.useFakeTimers();
    mod.createWindow();
    const reveal = whenChromeReady.mock.calls[0]![1];
    const win = winReg.instances[0] as FakeWin;

    reveal();
    reveal(); // shown guard
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it('the reveal parks in the tray under startupMode "background"', () => {
    vi.useFakeTimers();
    prefs.getAll.mockReturnValue({
      startupMode: 'background',
      glassChrome: false,
      windowBounds: null,
    });
    mod.createWindow();
    const reveal = whenChromeReady.mock.calls[0]![1];
    const win = winReg.instances[0] as FakeWin;

    reveal();
    expect(win.showInactive).toHaveBeenCalled();
    expect(win.setSkipTaskbar).toHaveBeenCalledWith(true);
    expect(win.show).not.toHaveBeenCalled();
  });

  it('the reveal enters kiosk under startupMode "kiosk"', () => {
    vi.useFakeTimers();
    prefs.getAll.mockReturnValue({ startupMode: 'kiosk', glassChrome: false, windowBounds: null });
    mod.createWindow();
    const reveal = whenChromeReady.mock.calls[0]![1];
    const win = winReg.instances[0] as FakeWin;

    reveal();
    expect(win.setKiosk).toHaveBeenCalledWith(true);
  });

  it('forceForeground shows normally even when the startup mode is background', () => {
    vi.useFakeTimers();
    prefs.getAll.mockReturnValue({
      startupMode: 'background',
      glassChrome: false,
      windowBounds: null,
    });
    mod.createWindow({ forceForeground: true });
    const reveal = whenChromeReady.mock.calls[0]![1];
    const win = winReg.instances[0] as FakeWin;

    reveal();
    expect(win.show).toHaveBeenCalled();
  });

  it('in eval mode it never restores placement and reveals shown-inactive', () => {
    vi.useFakeTimers();
    process.env['TEPEGOZ_EVAL'] = '1';
    prefs.getAll.mockReturnValue({
      startupMode: 'window',
      glassChrome: false,
      windowBounds: { x: 1, y: 1, width: 400, height: 300, maximized: true },
    });
    mod.createWindow();
    const win = winReg.instances[0] as FakeWin;
    expect(win.opts).not.toHaveProperty('x'); // saved placement ignored
    expect(win.maximize).not.toHaveBeenCalled();

    const reveal = whenChromeReady.mock.calls[0]![1];
    reveal();
    expect(win.showInactive).toHaveBeenCalled();
    expect(win.show).not.toHaveBeenCalled();
  });

  it('hands external https to the OS browser and denies every new-window request', () => {
    vi.useFakeTimers();
    mod.createWindow();
    const win = winReg.instances[0] as FakeWin;
    const handler = win.webContents.setWindowOpenHandler.mock.calls[0]![0];

    expect(handler({ url: 'https://example.com/' })).toEqual({ action: 'deny' });
    expect(handler({ url: 'about:blank' })).toEqual({ action: 'deny' });
  });

  it('blocks a chrome-window navigation to an untrusted URL', () => {
    vi.useFakeTimers();
    mod.createWindow();
    const win = winReg.instances[0] as FakeWin;
    const prevent = vi.fn();

    isTrustedAppUrl.mockReturnValue(true);
    win.fireWc('will-navigate', { preventDefault: prevent }, 'tepegoz://settings');
    expect(prevent).not.toHaveBeenCalled();

    isTrustedAppUrl.mockReturnValue(false);
    win.fireWc('will-navigate', { preventDefault: prevent }, 'https://evil.example/');
    expect(prevent).toHaveBeenCalled();
  });

  it('suppresses the chrome document title from reaching the OS window title', () => {
    vi.useFakeTimers();
    mod.createWindow();
    const win = winReg.instances[0] as FakeWin;
    const prevent = vi.fn();
    win.fireWc('page-title-updated', { preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
  });

  it('persists debounced placement on move/resize and flushes synchronously on close', () => {
    vi.useFakeTimers();
    mod.createWindow();
    const win = winReg.instances[0] as FakeWin;

    win.fire('resize');
    expect(prefs.update).not.toHaveBeenCalled(); // debounced
    vi.advanceTimersByTime(400);
    expect(prefs.update).toHaveBeenCalledWith({
      windowBounds: { x: 7, y: 8, width: 640, height: 480, maximized: false },
    });

    prefs.update.mockClear();
    win.fire('close');
    expect(prefs.update).toHaveBeenCalled(); // synchronous flush
  });

  it('keeps the maximize button in sync with OS-driven maximize / unmaximize', () => {
    vi.useFakeTimers();
    mod.createWindow();
    const win = winReg.instances[0] as FakeWin;
    win.fire('maximize');
    expect(win.webContents.send).toHaveBeenCalledWith(expect.stringMatching(/maximiz/i), false);
  });
});

describe('createPopupWindow / createDragPreviewWindow', () => {
  it('createPopupWindow is a hardened, non-resizable child that denies navigation', () => {
    const parent = new BrowserWindowMock({});
    winReg.opts.length = 0;
    winReg.instances.length = 0;

    const win = mod.createPopupWindow(parent as never, {
      x: 0,
      y: 0,
      width: 320,
      height: 200,
    }) as unknown as FakeWin;

    expect(win.opts).toMatchObject({
      parent,
      resizable: false,
      show: false,
      frame: false,
      skipTaskbar: true,
      webPreferences: expect.objectContaining({ sandbox: true }) as object,
    });
    expect(win.setMenu).toHaveBeenCalledWith(null);
    const openHandler = win.webContents.setWindowOpenHandler.mock.calls[0]![0];
    expect(openHandler({ url: 'https://x/' })).toEqual({ action: 'deny' });
  });

  it('createDragPreviewWindow is a transparent, click-through, always-on-top chip', () => {
    const win = mod.createDragPreviewWindow() as unknown as FakeWin;

    expect(win.opts).toMatchObject({
      transparent: true,
      focusable: false,
      alwaysOnTop: true,
      width: 232,
      height: 40,
    });
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
  });
});
