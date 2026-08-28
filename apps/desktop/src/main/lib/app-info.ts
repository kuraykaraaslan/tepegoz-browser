import { app } from 'electron';
import { existsSync } from 'node:fs';
import { arch, release } from 'node:os';
import { dirname, join } from 'node:path';
import type { AppInfo, AppBuildInfo, AppOsInfo } from '@tepegoz/desktop-ipc';

/**
 * Everything the About page says about THIS build, in one place.
 *
 * Two rules hold this file together. First, main is the only process that can see the real numbers —
 * `process.versions`, `app.isPackaged`, the OS release — so it produces them and the renderer only
 * displays them. Second, an unknown value is reported as unknown: an unstamped build returns `''` for
 * its commit rather than a plausible-looking placeholder, because a bug report carrying an invented
 * provenance is worse than one that admits it has none.
 */

/**
 * Stamped into the main bundle by `electron.vite.config.ts` (`define`). Declared in `build-env.d.ts`.
 * Every read goes through `typeof` FIRST and never binds the identifier before that check: a `vitest`
 * process bundles nothing, so these are genuinely undeclared there and `const x = __X__` would throw a
 * ReferenceError where `typeof __X__` is safe.
 */
const BUILD_COMMIT = typeof __TEPEGOZ_BUILD_COMMIT__ === 'string' ? __TEPEGOZ_BUILD_COMMIT__ : '';
const BUILD_TIME = typeof __TEPEGOZ_BUILD_TIME__ === 'string' ? __TEPEGOZ_BUILD_TIME__ : '';
const BUILD_CHANNEL = typeof __TEPEGOZ_BUILD_CHANNEL__ === 'string' ? __TEPEGOZ_BUILD_CHANNEL__ : '';

/**
 * Tepegöz's own license. Duplicated from `apps/desktop/package.json` because main has no loader for it
 * (`app.getVersion()` has no `getLicense()` twin) — `app-info.test.ts` fails if the two ever drift, so
 * this is a checked copy rather than an unchecked one.
 */
export const APP_LICENSE = 'AGPL-3.0-only';

/** Windows 10 and 11 both report kernel `10.0.x`; the build number is the only thing that separates them. */
function windowsName(): string {
  const [major, , build] = release().split('.');
  if (major !== '10') return 'Windows';
  return Number(build ?? 0) >= 22000 ? 'Windows 11' : 'Windows 10';
}

/** Platforms we ship for. Anything else falls back to the raw `process.platform` — honest, if terse. */
const OS_NAMES: Partial<Record<NodeJS.Platform, () => string>> = {
  win32: windowsName,
  darwin: () => 'macOS',
  linux: () => 'Linux',
};

function osInfo(): AppOsInfo {
  const name = OS_NAMES[process.platform]?.() ?? process.platform;
  return { name, version: release(), arch: arch() };
}

function buildInfo(): AppBuildInfo {
  const packaged = app.isPackaged;
  // An unpackaged run is a dev run whatever the bundle claims — the channel a user reads must describe
  // what they are running, not what the build script was aiming at.
  return {
    channel: packaged && BUILD_CHANNEL !== '' ? BUILD_CHANNEL : 'dev',
    commit: BUILD_COMMIT,
    builtAt: BUILD_TIME,
    packaged,
  };
}

/** The full About payload. `glassAvailable` is passed in so this file stays free of window concerns. */
export function buildAppInfo(glassAvailable: boolean): AppInfo {
  return {
    name: 'Tepegöz',
    version: app.getVersion(),
    platform: process.platform,
    glassAvailable,
    os: osInfo(),
    engines: {
      chromium: process.versions.chrome ?? '',
      electron: process.versions.electron ?? '',
      node: process.versions.node,
      v8: process.versions.v8,
    },
    build: buildInfo(),
    license: APP_LICENSE,
  };
}

/**
 * The clipboard block for a bug report. Deliberately NOT localized: these field names are read by
 * whoever triages the report, and a maintainer should not have to recognise `Sürüm:` and `Version:` as
 * the same line. Nothing here is user data — it is the same set of facts a user-agent string carries.
 */
export function diagnosticsText(info: AppInfo, locale: string): string {
  const b = info.build;
  const provenance = [b.channel, b.packaged ? 'packaged' : 'unpackaged', b.commit]
    .filter((part) => part !== '')
    .join(', ');
  return [
    `${info.name} ${info.version} (${provenance})`,
    b.builtAt === '' ? 'Built: unstamped' : `Built: ${b.builtAt}`,
    `Chromium: ${info.engines.chromium} · Electron: ${info.engines.electron} · Node: ${info.engines.node} · V8: ${info.engines.v8}`,
    `OS: ${info.os.name} ${info.os.version} (${info.os.arch})`,
    `Locale: ${locale}`,
  ].join('\n');
}

/**
 * Electron ships `LICENSES.chromium.html` next to the executable — in a packaged app and in
 * `node_modules/electron/dist` alike, so one path covers both. Returns `null` when it is absent so the
 * caller can fall back to the online copy instead of opening nothing.
 */
export function thirdPartyNoticesPath(): string | null {
  const candidate = join(dirname(app.getPath('exe')), 'LICENSES.chromium.html');
  return existsSync(candidate) ? candidate : null;
}
