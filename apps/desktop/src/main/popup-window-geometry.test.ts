import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, Rectangle } from 'electron';

/**
 * The popup placement math — anchoring a frameless child window under a toolbar control (or a submenu
 * beside it) and clamping it to the display's work area. This is the part that goes wrong invisibly:
 * a menu half off-screen, or a submenu that never falls back to the right edge when the window hugs
 * the left of the screen.
 */

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
vi.mock('electron', () => ({
  screen: { getDisplayMatching: () => ({ workArea }) },
}));
vi.mock('./window', () => ({ createPopupWindow: vi.fn() }));
vi.mock('./lib/surface-theme', () => ({ resolveSurfaceTheme: () => 'light' }));
vi.mock('./chrome-url', () => ({ chromeFilePath: () => '/x/index.html' }));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn() } }));

const { anchorToBounds, subAnchorToBounds } = await import('./popup-window');

function parentAt(content: Rectangle, bounds: Rectangle = content): BrowserWindow {
  return {
    getContentBounds: () => content,
    getBounds: () => bounds,
  } as unknown as BrowserWindow;
}
const rect = (x: number, y: number, width: number, height: number): Rectangle => ({
  x,
  y,
  width,
  height,
});

describe('anchorToBounds', () => {
  const parent = parentAt(rect(100, 80, 1200, 800));

  it("align 'end' right-aligns the popup to the anchor and drops it just below", () => {
    const b = anchorToBounds(parent, rect(500, 40, 32, 32), 360, 400, 'end');
    // x = contentX + anchorX + anchorW - width = 100 + 500 + 32 - 360
    expect(b.x).toBe(272);
    // y = contentY + anchorY + anchorH + GAP(6) = 80 + 40 + 32 + 6
    expect(b.y).toBe(158);
    expect(b.width).toBe(360);
    expect(b.height).toBe(400);
  });

  it("align 'start' left-aligns to the anchor (a context menu opens rightward)", () => {
    const b = anchorToBounds(parent, rect(500, 40, 0, 0), 360, 400, 'start');
    expect(b.x).toBe(600); // contentX + anchorX
  });

  it('clamps a popup that would overflow the right edge back inside the work area', () => {
    const b = anchorToBounds(parentAt(rect(0, 0, 1920, 1000)), rect(1900, 10, 0, 0), 360, 200, 'start');
    expect(b.x).toBe(workArea.width - 360); // 1560
  });

  it('caps the height to the space left below the anchor, but never below MIN_HEIGHT', () => {
    // Anchor near the bottom: only a sliver of room, so height floors at MIN_HEIGHT (160).
    const b = anchorToBounds(parentAt(rect(0, 900, 1920, 140)), rect(0, 120, 0, 20), 360, 520);
    expect(b.height).toBe(160);
  });
});

describe('subAnchorToBounds', () => {
  it('opens to the LEFT of the primary, 1px overlapped, row-aligned', () => {
    const primary = parentAt(rect(800, 100, 360, 400));
    const b = subAnchorToBounds(primary, rect(0, 72, 0, 0), 200);
    expect(b.x).toBe(800 - 260 + 1); // primaryX - SUBMENU_WIDTH + 1
    expect(b.y).toBe(172); // primaryY + anchorY
    expect(b.width).toBe(260);
  });

  it('falls back to the RIGHT side when there is no room on the left', () => {
    const primary = parentAt(rect(20, 100, 360, 400));
    const b = subAnchorToBounds(primary, rect(0, 0, 0, 0), 200);
    expect(b.x).toBe(20 + 360 - 1); // primaryX + primaryW - 1
  });
});
