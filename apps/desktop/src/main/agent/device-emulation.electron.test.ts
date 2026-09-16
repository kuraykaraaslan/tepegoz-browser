import { describe, it, expect, vi } from 'vitest';
import type { WebContents } from 'electron';
import { setDeviceEmulation } from './device-emulation.electron';

/**
 * `webContents.enableDeviceEmulation` has no user-agent knob, and a page's mobile layout is decided by
 * BOTH viewport width and UA sniffing — so `'mobile'` must set both, and `'desktop'` must restore the
 * ORIGINAL user agent rather than guessing a default, since a guessed default could differ from what
 * this particular WebContents was actually sending before.
 */
function fakeWc(startingUserAgent = 'RealUA/1.0'): {
  wc: WebContents;
  enableCalls: unknown[];
  disableCalls: number;
  userAgent: string;
  destroyedHandlers: (() => void)[];
} {
  const state = {
    enableCalls: [] as unknown[],
    disableCalls: 0,
    userAgent: startingUserAgent,
    destroyedHandlers: [] as (() => void)[],
    destroyed: false,
  };
  const wc = {
    isDestroyed: () => state.destroyed,
    getUserAgent: () => state.userAgent,
    setUserAgent: (ua: string) => {
      state.userAgent = ua;
    },
    enableDeviceEmulation: (params: unknown) => {
      state.enableCalls.push(params);
    },
    disableDeviceEmulation: () => {
      state.disableCalls += 1;
    },
    once: (event: string, handler: () => void) => {
      if (event === 'destroyed') state.destroyedHandlers.push(handler);
    },
  } as unknown as WebContents;
  return {
    wc,
    get enableCalls() {
      return state.enableCalls;
    },
    get disableCalls() {
      return state.disableCalls;
    },
    get userAgent() {
      return state.userAgent;
    },
    get destroyedHandlers() {
      return state.destroyedHandlers;
    },
  };
}

describe('setDeviceEmulation', () => {
  it('mobile: enables emulation and switches to the mobile user agent', () => {
    const h = fakeWc('RealUA/1.0');
    setDeviceEmulation(h.wc, 'mobile');
    expect(h.enableCalls).toHaveLength(1);
    expect(h.userAgent).not.toBe('RealUA/1.0');
    expect(h.userAgent).toContain('Mobile');
  });

  it('desktop: restores the EXACT original user agent, not a guessed default', () => {
    const h = fakeWc('RealUA/1.0');
    setDeviceEmulation(h.wc, 'mobile');
    setDeviceEmulation(h.wc, 'desktop');
    expect(h.disableCalls).toBe(1);
    expect(h.userAgent).toBe('RealUA/1.0');
  });

  it('desktop on a tab never put into mobile mode is a harmless no-op', () => {
    const h = fakeWc('RealUA/1.0');
    expect(() => setDeviceEmulation(h.wc, 'desktop')).not.toThrow();
    expect(h.disableCalls).toBe(1);
    expect(h.userAgent).toBe('RealUA/1.0'); // untouched — nothing to restore
  });

  it('a second mobile call does not overwrite the captured original with the mobile UA', () => {
    const h = fakeWc('RealUA/1.0');
    setDeviceEmulation(h.wc, 'mobile');
    setDeviceEmulation(h.wc, 'mobile'); // e.g. the agent re-checks mobile layout without switching back
    setDeviceEmulation(h.wc, 'desktop');
    expect(h.userAgent).toBe('RealUA/1.0');
  });

  it('throws for an already-destroyed tab rather than touching a dead WebContents', () => {
    const h = fakeWc();
    vi.spyOn(h.wc, 'isDestroyed').mockReturnValue(true);
    expect(() => setDeviceEmulation(h.wc, 'mobile')).toThrow();
  });

  it('clears the captured original user agent when the tab is destroyed mid-emulation', () => {
    const h = fakeWc('RealUA/1.0');
    setDeviceEmulation(h.wc, 'mobile');
    const mobileUa = h.userAgent;
    expect(h.destroyedHandlers).toHaveLength(1);
    h.destroyedHandlers[0]?.(); // simulate the tab closing while still in mobile mode

    // The map entry for this WebContents is gone, so a later 'desktop' call (e.g. a stale callback
    // racing the close) has nothing to restore and must not fabricate a value.
    setDeviceEmulation(h.wc, 'desktop');
    expect(h.userAgent).toBe(mobileUa);
  });
});
