import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The Chrome-like tab tear-off coordinator (main process). Pinned: `registerTabDragIpc` wires one
 * handler per drag channel; `tabsDragBegin` clears any prior preview, sizes a fresh one to the
 * (clamped) tab size and loads its surface; `tabsDragMove` repositions the preview so the grab point
 * stays under the cursor; `tabsDragEnd` tears the session down then drops — merging into a hovered
 * window's strip at the computed insertion index, doing nothing when dropped back on the source, and
 * tearing off into a new window on a miss; `tabsDragCancel` discards the preview; and
 * `tabsReportStrip` records geometry, registering the closed-cleanup only on the first report.
 */

const helpers = vi.hoisted(() => ({
  actions: new Map<string, (win: unknown, payload: unknown) => void>(),
  signals: new Map<string, () => void>(),
}));
vi.mock('./ipc/ipc-helpers', () => ({
  onWindowAction: (c: string, _schema: unknown, fn: (win: unknown, p: unknown) => void) =>
    helpers.actions.set(c, fn),
  onWindowSignal: (c: string, fn: () => void) => helpers.signals.set(c, fn),
}));

const preview = vi.hoisted(() => ({
  isDestroyed: vi.fn(() => false),
  isVisible: vi.fn(() => false),
  setSize: vi.fn(),
  setPosition: vi.fn(),
  showInactive: vi.fn(),
  close: vi.fn(),
  loadURL: vi.fn(() => Promise.resolve()),
  loadFile: vi.fn(() => Promise.resolve()),
}));
vi.mock('./window', () => ({ createDragPreviewWindow: () => preview }));
vi.mock('./chrome-url', () => ({ chromeFilePath: () => '/app/chrome.html' }));
const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
vi.mock('./lib/surface-theme', () => ({
  resolveSurfaceTheme: () => ({ theme: 'dark', themeColor: '' }),
}));
vi.mock('@tepegoz/desktop-ipc/schemas', () => ({
  TabDragBeginSchema: {},
  TabDragPointSchema: {},
  TabStripGeometrySchema: {},
}));

const tm = vi.hoisted(() => ({
  all: vi.fn((): unknown[] => []),
  forWindow: vi.fn<(win: unknown) => unknown>(() => undefined),
}));
vi.mock('./tabs', () => ({ default: tm }));

const openWindow = vi.hoisted(() => vi.fn((): unknown => ({ id: 99, isDestroyed: () => false })));
vi.mock('./browser-windows', () => ({ openWindow }));

const { registerTabDragIpc } = await import('./tab-drag-coordinator');

function fakeWin(id: number) {
  return {
    id,
    isDestroyed: () => false,
    focus: vi.fn(),
    once: vi.fn(),
    getContentBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
  };
}
const source = fakeWin(1);
const dest = fakeWin(2);

const begin = (over: Record<string, unknown> = {}) =>
  helpers.actions.get(IpcChannels.tabsDragBegin)!(source, {
    item: { kind: 'tab', id: 't1' },
    width: 120,
    height: 30,
    grabOffset: { x: 10, y: 5 },
    faviconUrl: null,
    title: 'Tab',
    active: false,
    pinned: false,
    groupColor: null,
    ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['ELECTRON_RENDERER_URL'];
  preview.isDestroyed.mockReturnValue(false);
  preview.isVisible.mockReturnValue(false);
  tm.all.mockReturnValue([]);
  tm.forWindow.mockReturnValue(undefined);
  registerTabDragIpc();
});
afterEach(() => {
  helpers.signals.get(IpcChannels.tabsDragCancel)?.();
});

describe('registerTabDragIpc', () => {
  it('wires a handler for every drag channel', () => {
    for (const c of [
      IpcChannels.tabsDragBegin,
      IpcChannels.tabsDragMove,
      IpcChannels.tabsDragEnd,
      IpcChannels.tabsReportStrip,
    ]) {
      expect(helpers.actions.has(c)).toBe(true);
    }
    expect(helpers.signals.has(IpcChannels.tabsDragCancel)).toBe(true);
    expect(helpers.signals.has(IpcChannels.windowNew)).toBe(true);
  });
});

describe('tabsDragBegin', () => {
  it('sizes a fresh preview to the clamped tab size and loads its surface (prod → file)', () => {
    begin({ width: 10, height: 5 }); // below the 48 / 24 floors
    expect(preview.setSize).toHaveBeenCalledWith(48, 24);
    expect(preview.loadFile).toHaveBeenCalledWith(
      '/app/chrome.html',
      expect.objectContaining({
        query: expect.objectContaining({ surface: 'drag-preview' }) as object,
      }),
    );
  });

  it('DEV: loads the preview surface from the dev server', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    begin();
    expect(preview.loadURL).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5173?'));
  });

  it('carries a within-limit favicon URL into the preview query', () => {
    begin({ faviconUrl: 'https://x.test/f.ico' });
    expect(preview.loadFile).toHaveBeenCalledWith(
      '/app/chrome.html',
      expect.objectContaining({
        query: expect.objectContaining({ favicon: 'https://x.test/f.ico' }) as object,
      }),
    );
  });

  it('logs, without throwing, when the preview surface fails to load', async () => {
    preview.loadFile.mockReturnValueOnce(Promise.reject(new Error('renderer gone')));
    begin();
    await new Promise((r) => setTimeout(r, 0)); // let the void loaded.catch(...) run
    expect(logger.warn).toHaveBeenCalledWith(
      'Drag preview failed to load',
      expect.objectContaining({ err: expect.stringContaining('renderer gone') as string }),
    );
  });
});

describe('tabsDragMove', () => {
  it('positions the preview so the grab point stays under the cursor and reveals it', () => {
    begin({ grabOffset: { x: 10, y: 5 }, width: 120, height: 30 });
    helpers.actions.get(IpcChannels.tabsDragMove)!(source, { screenX: 500, screenY: 400 });
    expect(preview.setPosition).toHaveBeenCalledWith(490, 395);
    expect(preview.showInactive).toHaveBeenCalled();
  });

  it('is a no-op when there is no active drag session', () => {
    helpers.actions.get(IpcChannels.tabsDragMove)!(source, { screenX: 1, screenY: 1 });
    expect(preview.setPosition).not.toHaveBeenCalled();
  });
});

describe('tabsDragEnd → performDrop', () => {
  const end = (point: { screenX: number; screenY: number }) =>
    helpers.actions.get(IpcChannels.tabsDragEnd)!(source, point);

  it('merges the tab into a hovered window at the slot-based insertion index', () => {
    const src = {
      groupMemberIds: vi.fn(),
      detachTab: vi.fn(() => ({ id: 't1' })),
      adoptTab: vi.fn(),
    };
    const dst = { detachTab: vi.fn(), adoptTab: vi.fn() };
    tm.all.mockReturnValue([{ window: dest }]);
    tm.forWindow.mockImplementation((w: unknown) => (w === source ? src : dst));
    // strip at (0,0,300,40); two slots each 100 wide → dropping at x=250 lands after both → index 2
    helpers.actions.get(IpcChannels.tabsReportStrip)!(dest, {
      strip: { x: 0, y: 0, width: 300, height: 40 },
      slots: [
        { left: 0, width: 100 },
        { left: 100, width: 100 },
      ],
    });
    begin();
    end({ screenX: 250, screenY: 20 });
    expect(src.detachTab).toHaveBeenCalledWith('t1');
    expect(dst.adoptTab).toHaveBeenCalledWith({ id: 't1' }, 2);
    expect(dest.focus).toHaveBeenCalled();
    expect(preview.close).toHaveBeenCalled();
  });

  it('does nothing when the tab is dropped back on the source window strip', () => {
    const src = { groupMemberIds: vi.fn(), detachTab: vi.fn(), adoptTab: vi.fn() };
    tm.all.mockReturnValue([{ window: source }]);
    tm.forWindow.mockReturnValue(src);
    helpers.actions.get(IpcChannels.tabsReportStrip)!(source, {
      strip: { x: 0, y: 0, width: 300, height: 40 },
      slots: [],
    });
    begin();
    end({ screenX: 50, screenY: 20 });
    expect(src.detachTab).not.toHaveBeenCalled();
  });

  it('tears off into a new window when the drop misses every strip', () => {
    const src = {
      groupMemberIds: vi.fn(),
      detachTab: vi.fn(() => ({ id: 't1' })),
      adoptTab: vi.fn(),
    };
    const newDst = { adoptTab: vi.fn() };
    tm.all.mockReturnValue([]);
    openWindow.mockReturnValue({ id: 99, isDestroyed: () => false });
    tm.forWindow.mockImplementation((w: unknown) => (w === source ? src : newDst));
    begin();
    end({ screenX: 4000, screenY: 4000 });
    expect(openWindow).toHaveBeenCalledWith(
      expect.objectContaining({ tabs: 'none', position: expect.any(Object) as object }),
    );
    expect(newDst.adoptTab).toHaveBeenCalledWith({ id: 't1' });
  });
});

describe('tabsDragCancel + tabsReportStrip + windowNew', () => {
  it('cancel discards the preview without a move', () => {
    begin();
    helpers.signals.get(IpcChannels.tabsDragCancel)!();
    expect(preview.close).toHaveBeenCalled();
    // a subsequent move is now a no-op
    helpers.actions.get(IpcChannels.tabsDragMove)!(source, { screenX: 1, screenY: 1 });
    expect(preview.setPosition).not.toHaveBeenCalled();
  });

  it('reportStrip registers the closed-cleanup only on the first report for a window', () => {
    const report = helpers.actions.get(IpcChannels.tabsReportStrip)!;
    const geo = { strip: { x: 0, y: 0, width: 1, height: 1 }, slots: [] };
    const fresh = fakeWin(4242); // a window id no other test has reported
    report(fresh, geo);
    report(fresh, geo);
    expect(fresh.once).toHaveBeenCalledTimes(1);
    expect(fresh.once).toHaveBeenCalledWith('closed', expect.any(Function));
  });

  it('windowNew opens a fresh default window', () => {
    helpers.signals.get(IpcChannels.windowNew)!();
    expect(openWindow).toHaveBeenCalledWith({ tabs: 'default' });
  });
});
