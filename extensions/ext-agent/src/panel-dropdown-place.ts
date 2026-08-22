/**
 * Where a portalled dropdown menu may be drawn.
 *
 * The Agent Console is docked chrome (DOM) sitting BESIDE the browsed page, and the page is a native
 * `WebContentsView` — Electron paints it above every chrome DOM node, whatever the `z-index`. So a menu
 * that spills sideways out of the panel is not drawn over the page, it disappears *behind* it (ADR-0012:
 * "a chrome-rendered overlay cannot paint over a native view"). The fix is geometric, not z-order: keep
 * the menu inside the panel's own rect.
 *
 * Pure so the rule is testable without a renderer.
 */

/** Marks the element whose rect bounds every menu portalled out of it — the Agent panel's root. */
export const PANEL_BOUNDS_ATTR = 'data-panel-bounds';

/** Breathing room between the menu and the panel's edges (px). */
const EDGE_GAP = 8;
/** Vertical gap between the trigger and the menu (px). */
const TRIGGER_GAP = 4;
/** A menu narrower than this is unusable; below it we'd rather overflow than render a sliver. */
const MIN_MENU_WIDTH = 160;

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlaceMenuInput {
  /** The trigger button's viewport rect. */
  trigger: Rect;
  /** The panel's viewport rect — the region chrome may safely paint in. `null` (no panel marker found,
   *  e.g. a surface with no native view beside it) falls back to the whole viewport. */
  bounds: Rect | null;
  viewport: { width: number; height: number };
  /** The menu's natural (unconstrained) width, measured once when it opens. */
  menuWidth: number;
  direction: 'down' | 'up';
  align: 'left' | 'right';
}

export interface MenuPlacement {
  left: number;
  /** Set for `direction: 'down'` — the menu hangs below the trigger. */
  top?: number;
  /** Set for `direction: 'up'` — the menu grows upward from the trigger, so it's anchored by its foot. */
  bottom?: number;
  /** Hard cap so a menu wider than the panel shrinks to fit instead of bleeding under the page. */
  maxWidth: number;
}

export function placeMenu(input: PlaceMenuInput): MenuPlacement {
  const { trigger, bounds, viewport, menuWidth, direction, align } = input;

  const minX = (bounds?.left ?? 0) + EDGE_GAP;
  const maxX = (bounds?.right ?? viewport.width) - EDGE_GAP;
  const maxWidth = Math.max(MIN_MENU_WIDTH, maxX - minX);
  // What the menu will actually occupy once `maxWidth` is applied — so the clamp below reasons about the
  // rendered box, not the natural one.
  const width = Math.min(menuWidth, maxWidth);

  // Preferred anchor: right-aligned menus hang off the trigger's right edge, left-aligned off its left.
  // Then slide horizontally (never resize further) until both edges are inside the panel.
  const desired = align === 'right' ? trigger.right - width : trigger.left;
  const left = Math.max(minX, Math.min(desired, maxX - width));

  return direction === 'up'
    ? { left, bottom: viewport.height - trigger.top + TRIGGER_GAP, maxWidth }
    : { left, top: trigger.bottom + TRIGGER_GAP, maxWidth };
}
