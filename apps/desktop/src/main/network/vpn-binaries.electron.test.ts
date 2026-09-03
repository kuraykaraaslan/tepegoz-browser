import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  paths: { wireproxy: '', tor: '' },
  home: '',
  userData: '',
  desktop: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'home' ? h.home : name === 'desktop' ? h.desktop : h.userData,
  },
}));
vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => ({ networkBinaries: h.paths }) },
}));

const { findBinaryInFolder, searchPaths, binDir, locateBinary, hasBinary, MissingBinaryError } =
  await import('./vpn-binaries.electron');

const realPlatform = process.platform;
function withPlatform(platform: NodeJS.Platform, run: () => void): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    run();
  } finally {
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  }
}

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vpnbin-'));
  dirs.push(dir);
  return dir;
}
function touchExecutable(path: string): void {
  writeFileSync(path, '#!/bin/sh\n', { mode: 0o755 });
}

/** The on-disk file name the locator looks for, which carries `.exe` on Windows. */
function binName(binary: 'tor' | 'wireproxy'): string {
  return process.platform === 'win32' ? `${binary}.exe` : binary;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  h.paths = { wireproxy: '', tor: '' };
});

describe('where it looks', () => {
  it('puts the user override FIRST — an explicit setting always wins over detection', () => {
    h.paths = { wireproxy: '/opt/mine/wireproxy', tor: '' };
    expect(searchPaths('wireproxy')[0]).toBe('/opt/mine/wireproxy');
  });

  it('omits the override entry entirely when none is set, rather than searching an empty path', () => {
    expect(searchPaths('tor').every((p) => p.length > 0)).toBe(true);
  });

  it('looks in the drop-in directory before PATH', () => {
    h.userData = join(sep, 'ud');
    const paths = searchPaths('tor');
    const dropIn = paths.findIndex((p) => p.includes(join('ud', 'bin')));
    expect(dropIn).toBeGreaterThanOrEqual(0);
  });

  it('knows where Tor Browser keeps its copy — the likeliest way Tor is already on disk', () => {
    h.home = join(sep, 'home', 'k');
    h.desktop = join(h.home, 'Desktop');
    const paths = searchPaths('tor');
    // The nested layout matters: pointing at the Tor Browser root alone would find nothing.
    expect(paths.some((p) => p.includes(join('Tor Browser', 'Browser', 'TorBrowser', 'Tor')))).toBe(
      true,
    );
  });

  it('never yields a path containing a control character (the backslash-escape trap)', () => {
    h.home = join(sep, 'home', 'k');
    // A literal Windows path in a TS string is an escape sequence waiting to be got wrong: '\t' in
    // 'C:\tor' is a TAB, and the resulting path silently matches nothing.
    for (const binary of ['tor', 'wireproxy'] as const) {
      for (const p of searchPaths(binary)) {
        expect(p).not.toMatch(/[\t\n\r\b\f\v]/);
      }
    }
  });
});

describe('searching a folder the user picked', () => {
  it('finds the binary sitting directly in it', () => {
    const dir = tempDir();
    touchExecutable(join(dir, binName('tor')));
    expect(findBinaryInFolder('tor', dir)).toBe(join(dir, binName('tor')));
  });

  it('finds it several levels down — picking the Tor Browser ROOT has to work', () => {
    const dir = tempDir();
    const nested = join(dir, 'Browser', 'TorBrowser', 'Tor');
    mkdirSync(nested, { recursive: true });
    touchExecutable(join(nested, binName('tor')));
    expect(findBinaryInFolder('tor', dir)).toBe(join(nested, binName('tor')));
  });

  it('returns null rather than guessing when the folder holds no such binary', () => {
    const dir = tempDir();
    touchExecutable(join(dir, 'something-else'));
    expect(findBinaryInFolder('tor', dir)).toBeNull();
  });

  it('does not confuse the two binaries', () => {
    const dir = tempDir();
    touchExecutable(join(dir, binName('tor')));
    expect(findBinaryInFolder('wireproxy', dir)).toBeNull();
  });

  it('survives an unreadable or missing folder instead of throwing', () => {
    expect(findBinaryInFolder('tor', join(tmpdir(), 'definitely-not-here-9f3a'))).toBeNull();
  });

  it('is bounded — a deep tree cannot make it walk forever', () => {
    const dir = tempDir();
    // Deeper than the depth cap: the binary at the bottom must NOT be found, which is what proves the
    // bound exists. An unbounded search would hang the app on a mistakenly-picked drive root.
    let deep = dir;
    for (let i = 0; i < 8; i += 1) {
      deep = join(deep, `d${String(i)}`);
      mkdirSync(deep);
    }
    touchExecutable(join(deep, binName('tor')));
    expect(findBinaryInFolder('tor', dir)).toBeNull();
  });
});

describe('binDir', () => {
  it('is userData/bin — the one place the UI tells the user to drop the file', () => {
    h.userData = join(sep, 'ud');
    expect(binDir()).toBe(join(sep, 'ud', 'bin'));
  });
});

describe('locateBinary / hasBinary', () => {
  it('returns the first executable it finds — the user override wins', () => {
    const dir = tempDir();
    const exe = join(dir, binName('wireproxy'));
    touchExecutable(exe);
    h.paths = { wireproxy: exe, tor: '' };
    expect(locateBinary('wireproxy')).toBe(exe);
    expect(hasBinary('wireproxy')).toBe(true);
  });

  it('skips a configured path that is not executable and keeps looking', () => {
    const dir = tempDir();
    const notExe = join(dir, 'not-real', binName('tor'));
    h.paths = { wireproxy: '', tor: notExe };
    // Nothing on disk for this path, and no real `tor` on a dev box → the search exhausts.
    expect(() => locateBinary('tor')).toThrow(MissingBinaryError);
    expect(hasBinary('tor')).toBe(false);
  });

  it('the thrown error names the binary that is missing', () => {
    h.paths = { wireproxy: join(tmpdir(), 'nope-wireproxy-4a1'), tor: '' };
    try {
      locateBinary('wireproxy');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingBinaryError);
      expect((err as InstanceType<typeof MissingBinaryError>).binary).toBe('wireproxy');
      expect((err as Error).message).toContain('wireproxy');
    }
  });
});

describe('per-platform well-known locations', () => {
  it('on Linux, searches the XDG-ish bin dirs and appends the plain binary name (no .exe)', () => {
    withPlatform('linux', () => {
      h.home = join(sep, 'home', 'k');
      const paths = searchPaths('tor');
      // `node:path.join` still follows the HOST OS separator regardless of `process.platform`, so
      // build the expected entries the same way the source does.
      expect(paths).toContain(join('/usr/bin', 'tor'));
      expect(paths).toContain(join(h.home, '.local', 'bin', 'tor'));
      expect(paths.every((p) => !p.endsWith('.exe'))).toBe(true);
    });
  });

  it('on macOS, also offers the Tor Browser bundle path for tor', () => {
    withPlatform('darwin', () => {
      h.home = join(sep, 'Users', 'k');
      expect(searchPaths('tor')).toContain('/Applications/Tor Browser.app/Contents/MacOS/Tor/tor');
      // wireproxy gets no such extra entry.
      expect(searchPaths('wireproxy').some((p) => p.includes('Tor Browser.app'))).toBe(false);
    });
  });
});
