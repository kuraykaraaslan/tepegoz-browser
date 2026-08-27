import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

/**
 * Windows 11 Mica "glass". `isMicaSupported` gates on platform + NT build >= 22000; `applyChromeGlass`
 * is safe to call anywhere — when unsupported or disabled it restores the opaque navy, and it is a
 * no-op on a destroyed window.
 */

const os = vi.hoisted(() => ({ rel: '10.0.22631' }));
vi.mock('node:os', () => ({ release: () => os.rel }));

const { isMicaSupported, applyChromeGlass, GLASS_BG, OPAQUE_BG } = await import('./glass');

const realPlatform = process.platform;
function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}
function fakeWin(destroyed = false) {
  const calls: Array<[string, string]> = [];
  const win = {
    calls,
    isDestroyed: () => destroyed,
    setBackgroundColor: (c: string) => calls.push(['color', c]),
    setBackgroundMaterial: (m: string) => calls.push(['material', m]),
  };
  return win as unknown as BrowserWindow & { calls: Array<[string, string]> };
}

beforeEach(() => {
  os.rel = '10.0.22631';
});
afterEach(() => setPlatform(realPlatform));

describe('isMicaSupported', () => {
  it('true on Windows 11 (build >= 22000)', () => {
    setPlatform('win32');
    os.rel = '10.0.22000';
    expect(isMicaSupported()).toBe(true);
  });

  it('false on Windows 10 (build < 22000)', () => {
    setPlatform('win32');
    os.rel = '10.0.19045';
    expect(isMicaSupported()).toBe(false);
  });

  it('false off Windows regardless of the release string', () => {
    setPlatform('darwin');
    os.rel = '23.0.0';
    expect(isMicaSupported()).toBe(false);
  });

  it('false when the build segment is unparseable', () => {
    setPlatform('win32');
    os.rel = 'weird';
    expect(isMicaSupported()).toBe(false);
  });
});

describe('applyChromeGlass', () => {
  it('supported + enabled → transparent fill + mica material', () => {
    setPlatform('win32');
    os.rel = '10.0.22631';
    const win = fakeWin();
    applyChromeGlass(win, true);
    expect(win.calls).toEqual([
      ['color', GLASS_BG],
      ['material', 'mica'],
    ]);
  });

  it('enabled but unsupported → opaque navy + no material', () => {
    setPlatform('linux');
    const win = fakeWin();
    applyChromeGlass(win, true);
    expect(win.calls).toEqual([
      ['material', 'none'],
      ['color', OPAQUE_BG],
    ]);
  });

  it('supported but disabled → opaque navy', () => {
    setPlatform('win32');
    const win = fakeWin();
    applyChromeGlass(win, false);
    expect(win.calls).toEqual([
      ['material', 'none'],
      ['color', OPAQUE_BG],
    ]);
  });

  it('no-op on a destroyed window', () => {
    setPlatform('win32');
    const win = fakeWin(true);
    applyChromeGlass(win, true);
    expect(win.calls).toEqual([]);
  });
});
