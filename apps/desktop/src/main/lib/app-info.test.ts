import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The About page's facts. Three things are worth a test here and the rest is plumbing:
 *
 *  1. the license string, because it is a hand-copied duplicate of `package.json` and AGPL-3.0 is a
 *     claim the UI makes to the user — a silent drift would misstate the terms this ships under;
 *  2. the unstamped path, because "no provenance" must survive all the way to the screen as an empty
 *     string rather than being filled in with something plausible;
 *  3. the Windows 10/11 split, since both report kernel `10.0.x` and only the build number tells them
 *     apart — the exact reason the raw `win32` in the old UI was useless.
 *
 * These run OUTSIDE vite, so `__TEPEGOZ_BUILD_*` genuinely do not exist — which is also the case this
 * suite needs in order to test the unstamped path at all.
 */

const os = vi.hoisted(() => ({ rel: '10.0.26200', cpu: 'x64' }));
vi.mock('node:os', () => ({ release: () => os.rel, arch: () => os.cpu }));

const electron = vi.hoisted(() => ({ version: '0.1.0', packaged: false, exe: 'C:\\app\\tepegoz.exe' }));
vi.mock('electron', () => ({
  app: {
    getVersion: () => electron.version,
    get isPackaged() {
      return electron.packaged;
    },
    getPath: () => electron.exe,
  },
}));

const fs = vi.hoisted(() => ({ exists: true }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: () => fs.exists };
});

const { APP_LICENSE, buildAppInfo, diagnosticsText, thirdPartyNoticesPath } = await import(
  './app-info'
);

const realPlatform = process.platform;
function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

beforeEach(() => {
  os.rel = '10.0.26200';
  os.cpu = 'x64';
  electron.packaged = false;
  fs.exists = true;
});
afterEach(() => {
  setPlatform(realPlatform);
});

describe('app-info', () => {
  it('reports the same license the package actually ships under', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { license?: string };
    expect(APP_LICENSE).toBe(pkg.license);
    expect(buildAppInfo(false).license).toBe(pkg.license);
  });

  it('leaves an unstamped build empty instead of inventing provenance', () => {
    const build = buildAppInfo(false).build;
    expect(build.commit).toBe('');
    expect(build.builtAt).toBe('');
    // Unpackaged ⇒ `dev`, whatever a bundle might have claimed: the channel must describe the thing
    // the user is running.
    expect(build.channel).toBe('dev');
    expect(build.packaged).toBe(false);
  });

  it('separates Windows 11 from Windows 10 by build number, not by platform', () => {
    setPlatform('win32');
    os.rel = '10.0.26200';
    expect(buildAppInfo(false).os.name).toBe('Windows 11');
    os.rel = '10.0.19045';
    expect(buildAppInfo(false).os.name).toBe('Windows 10');
    os.rel = '6.3.9600';
    expect(buildAppInfo(false).os.name).toBe('Windows');
  });

  it('names the other platforms and carries the raw one through untouched', () => {
    setPlatform('darwin');
    expect(buildAppInfo(false).os.name).toBe('macOS');
    setPlatform('linux');
    expect(buildAppInfo(false).os.name).toBe('Linux');
    setPlatform('freebsd');
    expect(buildAppInfo(false).os.name).toBe('freebsd');
    expect(buildAppInfo(false).platform).toBe('freebsd');
  });

  it('says so in the diagnostics block when the build carries no stamp', () => {
    const text = diagnosticsText(buildAppInfo(false), 'tr');
    expect(text).toContain('Built: unstamped');
    expect(text).toContain('unpackaged');
    expect(text).toContain('Locale: tr');
    expect(text).toContain(`Chromium: ${process.versions.chrome ?? ''}`);
  });

  it('spells out version, provenance and OS for a stamped, packaged build', () => {
    electron.packaged = true;
    const info = buildAppInfo(false);
    const text = diagnosticsText(
      { ...info, build: { ...info.build, commit: 'abc12345', builtAt: '2026-08-28T09:00:00.000Z' } },
      'en',
    );
    expect(text.split('\n')[0]).toBe('Tepegöz 0.1.0 (dev, packaged, abc12345)');
    expect(text).toContain('Built: 2026-08-28T09:00:00.000Z');
    expect(text).toContain(`OS: ${info.os.name} ${info.os.version} (x64)`);
  });

  it('reports no notices file rather than handing back a path that is not there', () => {
    expect(thirdPartyNoticesPath()).not.toBeNull();
    fs.exists = false;
    expect(thirdPartyNoticesPath()).toBeNull();
  });
});
