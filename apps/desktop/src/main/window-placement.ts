import { screen, type Rectangle } from 'electron';

/**
 * Where a remembered window rectangle may legally reopen.
 *
 * A saved placement outlives the display layout that produced it: unplug the left-hand monitor and a
 * remembered `x: -1622` names screen space that no longer exists. Windows will happily create the window
 * there — shown, focusable, and completely invisible, with no caption to drag back. So EVERY path that
 * restores a remembered rectangle (the `windowBounds` preference AND the session snapshot) must run it
 * through this module first; a guard on only one of them is the same bug with a narrower trigger.
 *
 * The core is pure (`isRectOnDisplays` / `placeRectOnDisplays` take the display list as an argument) so
 * it is unit-testable without an Electron `screen`; the exported wrappers supply the real displays.
 */

/** The minimal display shape this module needs — `Electron.Display['workArea']`, nothing else. */
interface WorkAreaOwner {
  workArea: Rectangle;
}

/** A remembered rectangle. Both saved shapes (preference + session snapshot) structurally satisfy it. */
export type SavedRect = Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>;

/** A real chunk of the title bar must land inside a work area — a 1px touch is still unreachable. */
const MIN_VISIBLE_WIDTH = 100;
const MIN_VISIBLE_HEIGHT = 50;

/** True when `rect` still lands (visibly) on one of `displays`. Pure — the testable core. */
export function isRectOnDisplays(rect: SavedRect, displays: readonly WorkAreaOwner[]): boolean {
  return displays.some(({ workArea: wa }) => {
    const overlapW = Math.min(rect.x + rect.width, wa.x + wa.width) - Math.max(rect.x, wa.x);
    const overlapH = Math.min(rect.y + rect.height, wa.y + wa.height) - Math.max(rect.y, wa.y);
    return overlapW >= MIN_VISIBLE_WIDTH && overlapH >= MIN_VISIBLE_HEIGHT;
  });
}

/**
 * `rect` if it is still reachable, otherwise the same SIZE centered on `primary` (shrunk to fit if the
 * remembered window is larger than the surviving screen). Size is remembered; position is not, because a
 * position on a vanished monitor is not a preference the user can act on.
 */
export function placeRectOnDisplays(
  rect: SavedRect,
  displays: readonly WorkAreaOwner[],
  primary: WorkAreaOwner | undefined,
): SavedRect {
  if (isRectOnDisplays(rect, displays)) return rect;
  const wa = primary?.workArea ?? displays[0]?.workArea;
  if (wa === undefined) return rect; // no display info at all — leave it to the OS
  const width = Math.min(rect.width, wa.width);
  const height = Math.min(rect.height, wa.height);
  return {
    x: Math.round(wa.x + (wa.width - width) / 2),
    y: Math.round(wa.y + (wa.height - height) / 2),
    width,
    height,
  };
}

/** True when the saved rectangle still lands on a currently-connected display. */
export function isBoundsOnScreen(rect: SavedRect): boolean {
  return isRectOnDisplays(rect, screen.getAllDisplays());
}

/** The saved rectangle, or an equally-sized one centered on the primary screen when it is unreachable. */
export function ensureOnScreen(rect: SavedRect): SavedRect {
  return placeRectOnDisplays(rect, screen.getAllDisplays(), screen.getPrimaryDisplay());
}
