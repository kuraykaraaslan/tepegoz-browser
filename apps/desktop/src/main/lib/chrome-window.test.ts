import { describe, expect, it } from 'vitest';
import type { BrowserWindow } from 'electron';
import { chromeWindowFor } from './chrome-window';

/**
 * Climbing from a frameless popup (main menu, Extensions panel, bookmark dropdown) to the browser
 * window that owns it, so a "run this extension action" / "pinned list changed" push lands in the
 * renderer that actually holds the chrome's state. A destroyed parent stops the climb — sending to a
 * window that is tearing down is the same mistake as sending to the popup.
 */

interface Node {
  id: string;
  parent: Node | null;
  destroyed?: boolean;
}

// One stable wrapper per node, so the parent chain is walkable. `__id` (not `id`, which is a real
// numeric BrowserWindow field) is a test marker used to name the window the climb landed on.
function build(node: Node): BrowserWindow {
  const wrapper = {
    __id: node.id,
    getParentWindow: () => (node.parent === null ? null : build(node.parent)),
    isDestroyed: () => node.destroyed === true,
  };
  return wrapper as unknown as BrowserWindow;
}

const idOf = (w: BrowserWindow): string => (w as unknown as { __id: string }).__id;

describe('chromeWindowFor', () => {
  it('returns the window itself when it is already top-level', () => {
    const top = build({ id: 'top', parent: null });
    expect(idOf(chromeWindowFor(top))).toBe('top');
  });

  it('climbs a single parent link from a popup to its browser window', () => {
    const browser: Node = { id: 'browser', parent: null };
    const popup = build({ id: 'popup', parent: browser });
    expect(idOf(chromeWindowFor(popup))).toBe('browser');
  });

  it('climbs several links (popup inside panel inside browser)', () => {
    const browser: Node = { id: 'browser', parent: null };
    const panel: Node = { id: 'panel', parent: browser };
    const popup = build({ id: 'popup', parent: panel });
    expect(idOf(chromeWindowFor(popup))).toBe('browser');
  });

  it('stops climbing at a destroyed parent rather than walking into it', () => {
    const dead: Node = { id: 'dead', parent: null, destroyed: true };
    const child = build({ id: 'child', parent: dead });
    expect(idOf(chromeWindowFor(child))).toBe('child');
  });
});
