import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The "open a new private window" seam. The guarantee that matters: `openPrivateWindow` is safe to
 * call before `browser-windows.ts` has installed the real opener (Ctrl+Shift+N can reach it during
 * startup, while a page has focus) — it does nothing rather than throwing — and the installer can
 * replace or clear the opener.
 */

let mod: typeof import('./private-window-opener');

beforeEach(async () => {
  vi.resetModules();
  mod = await import('./private-window-opener');
});

describe('openPrivateWindow', () => {
  it('does nothing when no opener has been installed yet', () => {
    expect(() => mod.openPrivateWindow()).not.toThrow();
  });

  it('calls the installed opener', () => {
    const opener = vi.fn();
    mod.setPrivateWindowOpener(opener);
    mod.openPrivateWindow();
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it('uses the most recently installed opener', () => {
    const first = vi.fn();
    const second = vi.fn();
    mod.setPrivateWindowOpener(first);
    mod.setPrivateWindowOpener(second);
    mod.openPrivateWindow();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('goes back to a no-op after the opener is cleared', () => {
    const opener = vi.fn();
    mod.setPrivateWindowOpener(opener);
    mod.setPrivateWindowOpener(null);
    expect(() => mod.openPrivateWindow()).not.toThrow();
    expect(opener).not.toHaveBeenCalled();
  });
});
