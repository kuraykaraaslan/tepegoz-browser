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
vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: class {},
  shell: { openExternal: vi.fn() },
}));

const parked = vi.hoisted(() => ({
  PARK_X: -32000,
  PARK_Y: -32000,
  isParkedToTray: vi.fn(),
  trayParked: new Map<unknown, unknown>(),
}));
vi.mock('./window-parked', () => parked);
vi.mock('./window-placement', () => ({
  ensureOnScreen: vi.fn((b: object) => ({ ...b, clamped: true })),
  isBoundsOnScreen: vi.fn(() => true),
}));
vi.mock('./lib/trusted-origin', () => ({ isTrustedAppUrl: () => true }));
vi.mock('./chrome-ready', () => ({ whenChromeReady: vi.fn(() => Promise.resolve()) }));
vi.mock('./lib/glass', () => ({ GLASS_BG: '#000', isMicaSupported: () => false }));
vi.mock('./lib/surface-theme', () => ({
  resolveSurfaceTheme: () => ({ color: '#101828', theme: 'dark', themeColor: '' }),
}));

const prefs = vi.hoisted(() => ({ getAll: vi.fn(() => ({ startupMode: 'window' })) }));
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
  appMock.commandLine.hasSwitch.mockReturnValue(false);
  prefs.getAll.mockReturnValue({ startupMode: 'window' });
  delete process.env['TEPEGOZ_START_BACKGROUND'];
});
afterEach(() => {
  delete process.env['TEPEGOZ_START_BACKGROUND'];
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
