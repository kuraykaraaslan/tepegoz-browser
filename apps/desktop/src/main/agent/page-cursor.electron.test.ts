import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hidePageCursor,
  isUserControlActive,
  resetForAgentAction,
  showPageCursor,
} from './page-cursor.electron';

/**
 * The simulated agent cursor. `showPageCursor` injects a `cursor:none` style tag + an SVG overlay
 * div and attaches a hardware-mouse listener; the moment the user's real mouse enters the webview
 * that listener yields control (`isUserControlActive()` flips true) and `showPageCursor` becomes a
 * no-op until `resetForAgentAction()` or `hidePageCursor` clears it. Pinned: the listener is attached
 * once, coordinates are injected at 0.1px precision, a destroyed WebContents is left untouched, and
 * the mouseMove / mouseLeave / reset control-flag transitions.
 */

type Handler = (event: unknown, ie: { type: string }) => void;

function fakeWc(destroyed = false) {
  const handlers: Record<string, Handler[]> = {};
  return {
    isDestroyed: () => destroyed,
    executeJavaScript: vi.fn<(script: string) => Promise<unknown>>(() => Promise.resolve()),
    on: vi.fn((ev: string, fn: Handler) => {
      (handlers[ev] ??= []).push(fn);
    }),
    removeListener: vi.fn((ev: string, fn: Handler) => {
      handlers[ev] = (handlers[ev] ?? []).filter((f) => f !== fn);
    }),
    emitInput: (type: string) => (handlers['input-event'] ?? []).forEach((f) => f({}, { type })),
  };
}
type FakeWc = ReturnType<typeof fakeWc>;
const asWc = (w: FakeWc) => w as unknown as Parameters<typeof showPageCursor>[0];

beforeEach(() => {
  resetForAgentAction();
});

describe('showPageCursor', () => {
  it('injects the overlay script with 0.1px-rounded coordinates and attaches the listener once', () => {
    const wc = fakeWc();
    showPageCursor(asWc(wc), 10.44, 20.56);
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1);
    const script = wc.executeJavaScript.mock.calls[0]![0];
    expect(script).toContain("left='10.4px'");
    expect(script).toContain("top='20.6px'");
    expect(script).toContain('__tpz_no_cursor');
    expect(script).toContain('<svg');

    showPageCursor(asWc(wc), 1, 2);
    expect(wc.on).toHaveBeenCalledTimes(1); // idempotent listener
  });

  it('does nothing for a destroyed WebContents', () => {
    const wc = fakeWc(true);
    showPageCursor(asWc(wc), 1, 2);
    expect(wc.executeJavaScript).not.toHaveBeenCalled();
    expect(wc.on).not.toHaveBeenCalled();
  });

  it('is a no-op once the user has taken control', () => {
    const wc = fakeWc();
    showPageCursor(asWc(wc), 1, 2); // 1 call, attaches listener
    wc.emitInput('mouseMove'); // user enters → yields control, 1 more call (style removal)
    expect(isUserControlActive()).toBe(true);
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(2);

    showPageCursor(asWc(wc), 3, 4); // suppressed
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(2);
  });
});

describe('the hardware-mouse listener', () => {
  it('mouseMove yields control only once; mouseLeave hands it back', () => {
    const wc = fakeWc();
    showPageCursor(asWc(wc), 1, 2);
    wc.emitInput('mouseMove');
    wc.emitInput('mouseMove'); // already controlled → no extra work
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(2);

    wc.emitInput('mouseLeave');
    expect(isUserControlActive()).toBe(false);
  });

  it('does not touch a destroyed WebContents on mouseMove', () => {
    const wc = fakeWc();
    showPageCursor(asWc(wc), 1, 2);
    wc.isDestroyed = () => true;
    wc.emitInput('mouseMove');
    expect(isUserControlActive()).toBe(true);
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1); // no style-removal call
  });
});

describe('control-flag resets', () => {
  it('resetForAgentAction clears user control', () => {
    const wc = fakeWc();
    showPageCursor(asWc(wc), 1, 2);
    wc.emitInput('mouseMove');
    expect(isUserControlActive()).toBe(true);
    resetForAgentAction();
    expect(isUserControlActive()).toBe(false);
  });
});

describe('hidePageCursor', () => {
  it('runs the teardown script, detaches the listener, and clears control', () => {
    const wc = fakeWc();
    showPageCursor(asWc(wc), 1, 2);
    wc.emitInput('mouseMove');

    hidePageCursor(asWc(wc));
    expect(wc.removeListener).toHaveBeenCalledWith('input-event', expect.any(Function));
    expect(isUserControlActive()).toBe(false);
    const script = wc.executeJavaScript.mock.calls.at(-1)![0];
    expect(script).toContain('__tpz_no_cursor');
    expect(script).toContain("display='none'");
  });

  it('does nothing for a destroyed WebContents', () => {
    const wc = fakeWc(true);
    hidePageCursor(asWc(wc));
    expect(wc.executeJavaScript).not.toHaveBeenCalled();
    expect(wc.removeListener).not.toHaveBeenCalled();
  });

  it('tolerates being called with no listener ever attached', () => {
    const wc = fakeWc();
    expect(() => hidePageCursor(asWc(wc))).not.toThrow();
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1);
  });
});
