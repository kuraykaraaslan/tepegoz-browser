import { describe, it, expect } from 'vitest';
import { placeMenu, type Rect } from './panel-dropdown-place';

/** A 360px-wide Agent panel docked at the right edge of a 1280×800 window. */
const VIEWPORT = { width: 1280, height: 800 };
const PANEL: Rect = { left: 920, right: 1280, top: 80, bottom: 800 };
/** The history button in the panel header — NOT the rightmost control (a "+" and an "×" follow it). */
const HISTORY_TRIGGER: Rect = { left: 1180, right: 1204, top: 88, bottom: 112 };

describe('placeMenu', () => {
  it('keeps a right-aligned menu inside the panel instead of spilling over the page', () => {
    // 320px (w-80) hung off the trigger's right edge would start at 884 — 36px into the web view,
    // where the native page paints over it. It must slide right until it clears the panel's edge.
    const p = placeMenu({
      trigger: HISTORY_TRIGGER,
      bounds: PANEL,
      viewport: VIEWPORT,
      menuWidth: 320,
      direction: 'down',
      align: 'right',
    });
    expect(p.left).toBe(928); // PANEL.left + 8px edge gap
    expect(p.left + Math.min(320, p.maxWidth)).toBeLessThanOrEqual(PANEL.right);
    expect(p.top).toBe(116); // trigger bottom + 4px gap
    expect(p.bottom).toBeUndefined();
  });

  it('honours the trigger anchor when the menu already fits', () => {
    const p = placeMenu({
      trigger: HISTORY_TRIGGER,
      bounds: PANEL,
      viewport: VIEWPORT,
      menuWidth: 200,
      direction: 'down',
      align: 'right',
    });
    expect(p.left).toBe(1004); // 1204 - 200, comfortably inside the panel
  });

  it('caps a menu wider than the panel so it cannot bleed under the page', () => {
    const narrow: Rect = { left: 1000, right: 1280, top: 80, bottom: 800 }; // 280px, the dock minimum
    const p = placeMenu({
      trigger: { left: 1180, right: 1204, top: 88, bottom: 112 },
      bounds: narrow,
      viewport: VIEWPORT,
      menuWidth: 320,
      direction: 'down',
      align: 'right',
    });
    expect(p.maxWidth).toBe(264); // 280 - 2×8
    expect(p.left).toBe(1008);
    expect(p.left + p.maxWidth).toBe(narrow.right - 8);
  });

  it('never shrinks below a usable width, even in an absurdly narrow panel', () => {
    const sliver: Rect = { left: 1200, right: 1280, top: 80, bottom: 800 };
    const p = placeMenu({
      trigger: { left: 1240, right: 1264, top: 88, bottom: 112 },
      bounds: sliver,
      viewport: VIEWPORT,
      menuWidth: 320,
      direction: 'down',
      align: 'right',
    });
    expect(p.maxWidth).toBe(160);
  });

  it('clamps a left-aligned menu that would run past the panel’s right edge', () => {
    // The composer's gear/skills pickers open rightward from near the panel's left edge.
    const p = placeMenu({
      trigger: { left: 1100, right: 1130, top: 700, bottom: 724 },
      bounds: PANEL,
      viewport: VIEWPORT,
      menuWidth: 288, // w-72
      direction: 'up',
      align: 'left',
    });
    expect(p.left).toBe(984); // 1272 - 288, slid left to fit
    expect(p.bottom).toBe(104); // viewport height - trigger top + 4
    expect(p.top).toBeUndefined();
  });

  it('falls back to the viewport when there is no panel around the trigger', () => {
    const p = placeMenu({
      trigger: { left: 40, right: 70, top: 10, bottom: 34 },
      bounds: null,
      viewport: VIEWPORT,
      menuWidth: 200,
      direction: 'down',
      align: 'left',
    });
    expect(p.left).toBe(40);
    expect(p.maxWidth).toBe(1264);
  });
});
