import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `popup-window` — the single-instance managed popup + submenu flyout. Pinned: `anchorToBounds` places
 * the popup under its anchor (right- vs left-aligned by `align`) and clamps x/y/height to the display
 * work area with a `MIN_HEIGHT` floor; `subAnchorToBounds` opens the flyout to the left of its parent,
 * flipping to the right when there is no room; `PopupWindowManager.open` is a single-instance
 * toggle-guard that swaps windows on a new key; `resize` clamps to the work area and no-ops an
 * unmanaged sender or an unchanged height; and the reveal gate shows the window once its timers fire.
 */

const screen = vi.hoisted(() => ({
  getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 2000, height: 1200 } })),
}));
const BrowserWindow = vi.hoisted(() => ({ getFocusedWindow: vi.fn((): unknown => null) }));
const createPopupWindow = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('electron', () => ({ BrowserWindow, screen }));
vi.mock('./chrome-url', () => ({ chromeFilePath: () => '/chrome.html' }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels: { popupClosed: 'popup:closed' } }));
vi.mock('./window', () => ({ createPopupWindow }));
vi.mock('./lib/surface-theme', () => ({
  resolveSurfaceTheme: () => ({ color: '#fff', theme: 'light', themeColor: '#ffffff' }),
}));

type Mod = typeof import('./popup-window');
async function load(): Promise<Mod> {
  vi.resetModules();
  return import('./popup-window');
}

const mkWin = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  on: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isVisible: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  close: vi.fn(),
  focus: vi.fn(),
  show: vi.fn(),
  showInactive: vi.fn(),
  setOpacity: vi.fn(),
  setBounds: vi.fn(),
  getBounds: vi.fn(() => ({ x: 100, y: 100, width: 360, height: 400 })),
  loadURL: vi.fn(() => Promise.resolve()),
  loadFile: vi.fn(() => Promise.resolve()),
  webContents: { once: vi.fn(), send: vi.fn() },
  ...over,
});

const parent = (): Record<string, unknown> => ({
  getContentBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
  getBounds: () => ({ x: 800, y: 100, width: 360, height: 500 }),
  isDestroyed: () => false,
  isMinimized: () => false,
  focus: vi.fn(),
  webContents: { send: vi.fn() },
});
const cast = <T>(v: unknown): T => v as T;

describe('anchorToBounds', () => {
  let anchorToBounds: Mod['anchorToBounds'];
  beforeEach(async () => {
    vi.clearAllMocks();
    screen.getDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 2000, height: 1200 },
    });
    ({ anchorToBounds } = await load());
  });

  it("right-aligns to the anchor's right edge by default", () => {
    const b = anchorToBounds(cast(parent()), { x: 500, y: 40, width: 200, height: 30 }, 360);
    expect(b).toEqual({ x: 340, y: 76, width: 360, height: 520 });
  });

  it("left-aligns to the anchor's left edge for align='start'", () => {
    const b = anchorToBounds(
      cast(parent()),
      { x: 500, y: 40, width: 200, height: 30 },
      360,
      undefined,
      'start',
    );
    expect(b.x).toBe(500);
  });

  it('clamps x into the work area when the popup would overflow the left edge', () => {
    const b = anchorToBounds(cast(parent()), { x: 10, y: 40, width: 50, height: 30 }, 360);
    expect(b.x).toBe(0);
  });

  it('caps the height to the space below the anchor, with a MIN_HEIGHT floor', () => {
    screen.getDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 2000, height: 200 },
    });
    const b = anchorToBounds(cast(parent()), { x: 500, y: 40, width: 200, height: 30 }, 360);
    expect(b.height).toBe(160);
  });
});

describe('subAnchorToBounds', () => {
  let subAnchorToBounds: Mod['subAnchorToBounds'];
  beforeEach(async () => {
    vi.clearAllMocks();
    screen.getDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 2000, height: 1200 },
    });
    ({ subAnchorToBounds } = await load());
  });

  it('opens to the left of the parent with a 1px overlap', () => {
    const b = subAnchorToBounds(cast(parent()), { x: 0, y: 50, width: 0, height: 0 });
    expect(b).toEqual({ x: 541, y: 150, width: 260, height: 520 });
  });

  it('flips to the right of the parent when there is no room on the left', () => {
    const p = { ...parent(), getBounds: () => ({ x: 10, y: 100, width: 360, height: 500 }) };
    const b = subAnchorToBounds(cast(p), { x: 0, y: 50, width: 0, height: 0 });
    expect(b.x).toBe(369);
  });

  it('keeps a 100px floor when the space below is tiny', () => {
    screen.getDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 2000, height: 200 },
    });
    const b = subAnchorToBounds(cast(parent()), { x: 0, y: 50, width: 0, height: 0 });
    expect(b.height).toBe(100);
  });
});

describe('PopupWindowManager', () => {
  let PopupWindowManager: Mod['default'];
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    delete process.env['ELECTRON_RENDERER_URL'];
    screen.getDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 2000, height: 1200 },
    });
    BrowserWindow.getFocusedWindow.mockReturnValue(null);
    createPopupWindow.mockImplementation(() => mkWin());
    PopupWindowManager = (await load()).default;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env['ELECTRON_RENDERER_URL'];
  });

  const openOpts = (key: string) => ({
    parent: cast<import('electron').BrowserWindow>(parent()),
    key,
    query: { surface: 'menu' },
    anchor: { x: 100, y: 40, width: 50, height: 20 },
  });
  type Vf = ReturnType<typeof vi.fn>;
  type W = {
    on: Vf;
    isDestroyed: Vf;
    isVisible: Vf;
    close: Vf;
    show: Vf;
    showInactive: Vf;
    setOpacity: Vf;
    setBounds: Vf;
    loadURL: Vf;
    loadFile: Vf;
    webContents: { once: Vf; send: Vf };
  };
  const win0 = () => createPopupWindow.mock.results[0]!.value as W;
  const win1 = () => createPopupWindow.mock.results[1]!.value as W;
  const handlerOf = (w: W, ev: string) =>
    w.on.mock.calls.find((c) => c[0] === ev)?.[1] as ((...a: unknown[]) => void) | undefined;
  const wcOnceOf = (w: W, ev: string) =>
    w.webContents.once.mock.calls.find((c) => c[0] === ev)?.[1] as
      ((...a: unknown[]) => void) | undefined;

  it('creates one popup window and swallows a re-open for the same key', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    PopupWindowManager.open(openOpts('main-menu'));
    expect(createPopupWindow).toHaveBeenCalledTimes(1);
  });

  it('closes the current popup and opens a new one for a different key', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    const first = createPopupWindow.mock.results[0]!.value as { close: ReturnType<typeof vi.fn> };
    PopupWindowManager.open(openOpts('ext:abc'));
    expect(first.close).toHaveBeenCalled();
    expect(createPopupWindow).toHaveBeenCalledTimes(2);
  });

  it('reveals the popup (show + fade) once its ceiling timer fires', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    const win = createPopupWindow.mock.results[0]!.value as {
      show: ReturnType<typeof vi.fn>;
      setOpacity: ReturnType<typeof vi.fn>;
    };
    vi.runOnlyPendingTimers();
    expect(win.show).toHaveBeenCalled();
    expect(win.setOpacity).toHaveBeenCalledWith(0);
  });

  it('resize ignores an unmanaged sender', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    const stranger = mkWin();
    PopupWindowManager.resize(cast(stranger), 300);
    expect(stranger.setBounds).not.toHaveBeenCalled();
  });

  it('resize clamps the managed popup to the work area and skips a no-op height', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    const win = createPopupWindow.mock.results[0]!.value as {
      setBounds: ReturnType<typeof vi.fn>;
      getBounds: () => { x: number; y: number; width: number; height: number };
    };
    PopupWindowManager.resize(cast(win), 300);
    expect(win.setBounds).toHaveBeenCalledWith({ x: 100, y: 100, width: 360, height: 300 });

    win.setBounds.mockClear();
    PopupWindowManager.resize(cast(win), 400); // equals current bounds height
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it('openSubmenu is a no-op with no primary popup, else attaches a flyout', () => {
    PopupWindowManager.openSubmenu({
      query: { surface: 'menu-sub' },
      anchor: { x: 0, y: 20, width: 0, height: 0 },
    });
    expect(createPopupWindow).not.toHaveBeenCalled();

    PopupWindowManager.open(openOpts('main-menu'));
    PopupWindowManager.openSubmenu({
      query: { surface: 'menu-sub' },
      anchor: { x: 0, y: 20, width: 0, height: 0 },
    });
    expect(createPopupWindow).toHaveBeenCalledTimes(2);
  });

  it('swallows a re-open that lands within the toggle-off guard window', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    handlerOf(win0(), 'closed')!(); // the window closed → records lastClosedKey / lastCloseAt
    PopupWindowManager.open(openOpts('main-menu')); // immediate re-trigger
    expect(createPopupWindow).toHaveBeenCalledTimes(1); // swallowed as a toggle-off
  });

  it("the blur handler closes the popup when focus left the menu, but not when it's on the menu itself", () => {
    PopupWindowManager.open(openOpts('main-menu'));
    const win = win0();
    const onBlur = handlerOf(win, 'blur')!;

    BrowserWindow.getFocusedWindow.mockReturnValue(win);
    onBlur();
    vi.advanceTimersByTime(100);
    expect(win.close).not.toHaveBeenCalled();

    BrowserWindow.getFocusedWindow.mockReturnValue(null);
    onBlur();
    vi.advanceTimersByTime(100);
    expect(win.close).toHaveBeenCalled();
  });

  it('the closed handler refocuses the parent and notifies the renderer', () => {
    const p = parent();
    PopupWindowManager.open({ ...openOpts('main-menu'), parent: cast(p) });
    handlerOf(win0(), 'closed')!();
    expect(p.focus as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect((p.webContents as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      'popup:closed',
      'main-menu',
    );
  });

  it('loadSurface uses the dev renderer URL when ELECTRON_RENDERER_URL is set', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    PopupWindowManager.open(openOpts('main-menu'));
    expect(win0().loadURL).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5173?'));
    expect(win0().loadFile).not.toHaveBeenCalled();
  });

  it('loadSurface logs a warning when the bundle fails to load', async () => {
    createPopupWindow.mockImplementation(() =>
      mkWin({ loadFile: vi.fn(() => Promise.reject(new Error('boom'))) }),
    );
    PopupWindowManager.open(openOpts('main-menu'));
    await vi.runAllTimersAsync().catch(() => undefined);
    expect(logger.warn).toHaveBeenCalledWith(
      'Popup failed to load',
      expect.objectContaining({ key: 'main-menu' }),
    );
  });

  it('a content measure debounces to a single settled reveal, then fades to full opacity', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    const win = win0();
    win.isVisible.mockReturnValue(false);

    PopupWindowManager.resize(cast(win), 300); // one measure → arms the settle timer
    PopupWindowManager.resize(cast(win), 320); // a second measure reschedules it
    vi.advanceTimersByTime(200); // settle + full fade ramp
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.setOpacity).toHaveBeenLastCalledWith(1);
  });

  it('did-finish-load swaps in the tighter fallback timer', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    const win = win0();
    wcOnceOf(win, 'did-finish-load')!();
    vi.advanceTimersByTime(260); // > FALLBACK_MS (250), < LOAD_CEILING_MS
    expect(win.show).toHaveBeenCalled();
  });

  it('resize floors a bookmark- popup at the smaller submenu height', () => {
    PopupWindowManager.open(openOpts('bookmark-folders'));
    const win = win0();
    PopupWindowManager.resize(cast(win), 10); // below both floors
    expect(win.setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ height: 44 }), // SUBMENU_MIN_HEIGHT, not MIN_HEIGHT
    );
  });

  it('close / closeSub tear down live windows and no-op destroyed ones', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    PopupWindowManager.openSubmenu({
      query: { surface: 'menu-sub' },
      anchor: { x: 0, y: 20, width: 0, height: 0 },
    });
    const primary = win0();
    const sub = win1();

    PopupWindowManager.close();
    expect(sub.close).toHaveBeenCalled(); // cascades to the sub first
    expect(primary.close).toHaveBeenCalled();

    primary.isDestroyed.mockReturnValue(true);
    primary.close.mockClear();
    PopupWindowManager.close();
    expect(primary.close).not.toHaveBeenCalled();
  });

  it('the submenu blur handler tears down the whole pair when focus leaves it', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    PopupWindowManager.openSubmenu({
      query: { surface: 'menu-sub' },
      anchor: { x: 0, y: 20, width: 0, height: 0 },
    });
    const primary = win0();
    const sub = win1();
    handlerOf(sub, 'blur')!();
    vi.advanceTimersByTime(100);
    expect(primary.close).toHaveBeenCalled();
  });

  it("the submenu's closed handler disarms its reveal and clears the sub reference", () => {
    PopupWindowManager.open(openOpts('main-menu'));
    PopupWindowManager.openSubmenu({
      query: { surface: 'menu-sub' },
      anchor: { x: 0, y: 20, width: 0, height: 0 },
    });
    const sub = win1();

    handlerOf(sub, 'closed')!();

    // subWin is now null → closeSub has nothing to close
    sub.close.mockClear();
    PopupWindowManager.closeSub();
    expect(sub.close).not.toHaveBeenCalled();
  });

  it('the submenu reveal shows the flyout without taking focus (showInactive)', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    PopupWindowManager.openSubmenu({
      query: { surface: 'menu-sub' },
      anchor: { x: 0, y: 20, width: 0, height: 0 },
    });
    const sub = win1();
    sub.isVisible.mockReturnValue(false);

    vi.runOnlyPendingTimers();

    expect(sub.showInactive).toHaveBeenCalled();
    expect(sub.show).not.toHaveBeenCalled();
  });

  it('the reveal fade stops itself when the window is destroyed mid-ramp', () => {
    PopupWindowManager.open(openOpts('main-menu'));
    const win = win0();
    win.isVisible.mockReturnValue(false);
    vi.runOnlyPendingTimers(); // doReveal → show() + arms the fade interval

    win.isDestroyed.mockReturnValue(true);
    win.setOpacity.mockClear();
    vi.advanceTimersByTime(200); // the next fade tick meets the destroyed window

    expect(win.setOpacity).not.toHaveBeenCalled(); // bailed before stepping opacity
  });
});
