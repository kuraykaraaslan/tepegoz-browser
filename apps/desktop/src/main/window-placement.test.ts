import { beforeEach, describe, expect, it, vi } from 'vitest';

const scr = vi.hoisted(() => ({
  getAllDisplays: vi.fn((): { workArea: { x: number; y: number; width: number; height: number } }[] => [
    { workArea: { x: 0, y: 0, width: 1920, height: 1050 } },
  ]),
  getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1050 } })),
}));
vi.mock('electron', () => ({ screen: scr }));

const { isRectOnDisplays, placeRectOnDisplays, isBoundsOnScreen, ensureOnScreen } = await import(
  './window-placement'
);

/** The single 1920×1080 laptop screen, 30px of taskbar taken off the work area. */
const primary = { workArea: { x: 0, y: 0, width: 1920, height: 1050 } };
/** A second monitor arranged to the LEFT — the layout that produces negative saved x values. */
const leftMonitor = { workArea: { x: -1920, y: 0, width: 1920, height: 1050 } };

describe('isRectOnDisplays', () => {
  it('accepts a rectangle on a connected display', () => {
    expect(isRectOnDisplays({ x: 100, y: 100, width: 988, height: 854 }, [primary])).toBe(true);
  });

  it('accepts a negative-x rectangle while the left-hand monitor is still connected', () => {
    expect(
      isRectOnDisplays({ x: -1622, y: 133, width: 988, height: 854 }, [primary, leftMonitor]),
    ).toBe(true);
  });

  it('rejects that same rectangle once the left-hand monitor is unplugged (the escape bug)', () => {
    // The regression guard: this is the placement that opened the window into dead screen space, shown
    // and focusable but invisible, with no caption left to drag back onto the surviving display.
    expect(isRectOnDisplays({ x: -1622, y: 133, width: 988, height: 854 }, [primary])).toBe(false);
  });

  it('rejects a barely-overlapping ghost (a sliver is not reachable)', () => {
    expect(isRectOnDisplays({ x: -978, y: 1040, width: 988, height: 854 }, [primary])).toBe(false);
  });

  it('rejects everything when no display is connected', () => {
    expect(isRectOnDisplays({ x: 0, y: 0, width: 988, height: 854 }, [])).toBe(false);
  });
});

describe('placeRectOnDisplays', () => {
  it('returns a reachable rectangle untouched', () => {
    const rect = { x: 100, y: 100, width: 988, height: 854 };
    expect(placeRectOnDisplays(rect, [primary], primary)).toBe(rect);
  });

  it('recenters an unreachable rectangle on the primary work area, keeping its size', () => {
    expect(
      placeRectOnDisplays({ x: -1622, y: 133, width: 988, height: 854 }, [primary], primary),
    ).toEqual({ x: 466, y: 98, width: 988, height: 854 });
  });

  it('shrinks a remembered window that is larger than the surviving screen', () => {
    const placed = placeRectOnDisplays(
      { x: -3000, y: 0, width: 2560, height: 1440 },
      [primary],
      primary,
    );
    expect(placed).toEqual({ x: 0, y: 0, width: 1920, height: 1050 });
  });

  it('falls back to the first display when there is no primary', () => {
    expect(
      placeRectOnDisplays({ x: -9000, y: 0, width: 800, height: 600 }, [leftMonitor], undefined),
    ).toEqual({ x: -1360, y: 225, width: 800, height: 600 });
  });

  it('leaves the rectangle alone when no display info is available', () => {
    const rect = { x: -1622, y: 133, width: 988, height: 854 };
    expect(placeRectOnDisplays(rect, [], undefined)).toBe(rect);
  });
});

describe('the Electron wrappers', () => {
  beforeEach(() => {
    scr.getAllDisplays.mockReturnValue([{ workArea: { x: 0, y: 0, width: 1920, height: 1050 } }]);
    scr.getPrimaryDisplay.mockReturnValue({ workArea: { x: 0, y: 0, width: 1920, height: 1050 } });
  });

  it('isBoundsOnScreen runs the saved rect against the live display list', () => {
    expect(isBoundsOnScreen({ x: 100, y: 100, width: 988, height: 854 })).toBe(true);
    scr.getAllDisplays.mockReturnValue([]); // every monitor unplugged
    expect(isBoundsOnScreen({ x: 100, y: 100, width: 988, height: 854 })).toBe(false);
  });

  it('ensureOnScreen recenters an unreachable rect on the live primary display', () => {
    expect(ensureOnScreen({ x: -5000, y: 0, width: 988, height: 854 })).toEqual({
      x: 466,
      y: 98,
      width: 988,
      height: 854,
    });
    expect(scr.getPrimaryDisplay).toHaveBeenCalled();
  });

  it('ensureOnScreen returns a still-reachable rect untouched', () => {
    const rect = { x: 100, y: 100, width: 988, height: 854 };
    expect(ensureOnScreen(rect)).toBe(rect);
  });
});
