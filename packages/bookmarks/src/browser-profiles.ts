import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BrowserImportSource } from './bookmark-import';

/**
 * Finding the browser profiles already on this computer, so importing does not start with "first, go
 * and export a file from the browser you are trying to leave".
 *
 * **Read-only, and never on a timer.** Detection runs when the user opens the import step and reads
 * nothing but the files named below. It does not watch, copy, or upload anything, and it is the user
 * who chooses which profile — if any — is imported.
 *
 * **Node-only module.** It is reached through the `@tepegoz/bookmarks/profiles` entry rather than the
 * package index because the renderer imports the index at runtime (`isBookmarkable`,
 * `BOOKMARK_ROOT_BAR`) and must never pull `node:fs` into its bundle.
 */

/** Which reader can open the file a detected profile keeps its bookmarks in. */
export type DetectedProfileFormat = 'chromium-json' | 'firefox-places';

export interface DetectedBrowserProfile {
  /**
   * Stable, opaque handle for one profile. It is a hash of the path, NOT the path: the renderer picks
   * a profile by id and main resolves that id by re-running detection, so an untrusted renderer can
   * never name a file for the main process to open. The absolute path stays on this side of the
   * boundary — it also carries the user's account name, which the chrome has no reason to hold.
   */
  id: string;
  source: BrowserImportSource;
  /** "Chrome", "Firefox" — the browser, for the UI. */
  browserLabel: string;
  /** The profile's own name as its browser shows it ("Default", "Work", "kuray"). */
  profileName: string;
  format: DetectedProfileFormat;
  /** Absolute path of the file to read. Main-process only — see `id`. */
  path: string;
  /** Last write time (ms). Sorted newest-first so the profile in daily use is offered first. */
  modifiedAt: number;
}

interface ChromiumFamily {
  source: BrowserImportSource;
  label: string;
  /** Candidate user-data directories, per platform. */
  dirs: (env: NodeJS.ProcessEnv, home: string, platform: NodeJS.Platform) => string[];
}

function localAppData(env: NodeJS.ProcessEnv, home: string): string {
  return env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
}
function roamingAppData(env: NodeJS.ProcessEnv, home: string): string {
  return env.APPDATA ?? join(home, 'AppData', 'Roaming');
}

const CHROMIUM_FAMILIES: ChromiumFamily[] = [
  {
    source: 'chrome',
    label: 'Chrome',
    dirs: (env, home, platform) =>
      platform === 'win32'
        ? [join(localAppData(env, home), 'Google', 'Chrome', 'User Data')]
        : platform === 'darwin'
          ? [join(home, 'Library', 'Application Support', 'Google', 'Chrome')]
          : [join(home, '.config', 'google-chrome')],
  },
  {
    source: 'edge',
    label: 'Edge',
    dirs: (env, home, platform) =>
      platform === 'win32'
        ? [join(localAppData(env, home), 'Microsoft', 'Edge', 'User Data')]
        : platform === 'darwin'
          ? [join(home, 'Library', 'Application Support', 'Microsoft Edge')]
          : [join(home, '.config', 'microsoft-edge')],
  },
  {
    source: 'brave',
    label: 'Brave',
    dirs: (env, home, platform) =>
      platform === 'win32'
        ? [join(localAppData(env, home), 'BraveSoftware', 'Brave-Browser', 'User Data')]
        : platform === 'darwin'
          ? [join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser')]
          : [join(home, '.config', 'BraveSoftware', 'Brave-Browser')],
  },
];

function firefoxRoots(env: NodeJS.ProcessEnv, home: string, platform: NodeJS.Platform): string[] {
  if (platform === 'win32') return [join(roamingAppData(env, home), 'Mozilla', 'Firefox')];
  if (platform === 'darwin') return [join(home, 'Library', 'Application Support', 'Firefox')];
  return [join(home, '.mozilla', 'firefox')];
}

export interface DetectOptions {
  platform?: NodeJS.Platform;
  home?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Every importable profile on this machine, newest-first. A browser that is not installed is simply
 * absent rather than an error, and so is a directory this user cannot read — every filesystem call
 * here is allowed to fail quietly.
 */
export function detectBrowserProfiles(options: DetectOptions = {}): DetectedBrowserProfile[] {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;

  const found: DetectedBrowserProfile[] = [];
  for (const family of CHROMIUM_FAMILIES) {
    for (const dir of family.dirs(env, home, platform)) {
      found.push(...detectChromiumProfiles(family, dir));
    }
  }
  for (const root of firefoxRoots(env, home, platform)) {
    found.push(...detectFirefoxProfiles(root));
  }
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/**
 * One entry per profile directory that actually holds a `Bookmarks` file. The file's existence is the
 * test, not `Local State`: a profile listed there whose file is missing would offer the user an import
 * that cannot run, and a profile missing from there but present on disk is still theirs.
 */
function detectChromiumProfiles(
  family: ChromiumFamily,
  userDataDir: string,
): DetectedBrowserProfile[] {
  const entries = readDirNames(userDataDir);
  if (entries.length === 0) return [];
  const names = readChromiumProfileNames(join(userDataDir, 'Local State'));

  const profiles: DetectedBrowserProfile[] = [];
  for (const entry of entries) {
    const file = join(userDataDir, entry, 'Bookmarks');
    const modifiedAt = modifiedTime(file);
    if (modifiedAt === null) continue;
    profiles.push({
      id: profileId(family.source, file),
      source: family.source,
      browserLabel: family.label,
      profileName: names.get(entry) ?? entry,
      format: 'chromium-json',
      path: file,
      modifiedAt,
    });
  }
  return profiles;
}

/** `Local State` → the display name Chrome shows for each profile directory. Best-effort by design:
 *  without it the directory name ("Profile 3") is still a truthful label. */
function readChromiumProfileNames(localStatePath: string): Map<string, string> {
  const names = new Map<string, string>();
  const raw = readTextFile(localStatePath, 4_194_304);
  if (raw === null) return names;
  try {
    const cache = (JSON.parse(raw) as { profile?: { info_cache?: unknown } } | null)?.profile
      ?.info_cache;
    if (cache === null || typeof cache !== 'object') return names;
    for (const [dir, info] of Object.entries(cache as Record<string, unknown>)) {
      const name = (info as { name?: unknown } | null)?.name;
      if (typeof name === 'string' && name.trim().length > 0) {
        names.set(dir, name.trim().slice(0, 120));
      }
    }
  } catch {
    // A corrupt Local State costs the pretty names and nothing else.
  }
  return names;
}

/** Firefox lists its profiles in `profiles.ini`; each one that has a `places.sqlite` is importable. */
function detectFirefoxProfiles(root: string): DetectedBrowserProfile[] {
  const ini = readTextFile(join(root, 'profiles.ini'), 1_048_576);
  if (ini === null) return [];

  const profiles: DetectedBrowserProfile[] = [];
  for (const section of parseIniSections(ini)) {
    if (!/^Profile\d+$/i.test(section.name)) continue;
    const relative = section.values.get('path');
    if (relative === undefined || relative.length === 0) continue;
    // `IsRelative=0` means Path is already absolute — a profile moved off the default location.
    const dir = section.values.get('isrelative') === '0' ? relative : join(root, relative);
    const file = join(dir, 'places.sqlite');
    const modifiedAt = modifiedTime(file);
    if (modifiedAt === null) continue;
    profiles.push({
      id: profileId('firefox', file),
      source: 'firefox',
      browserLabel: 'Firefox',
      profileName: section.values.get('name') ?? relative,
      format: 'firefox-places',
      path: file,
      modifiedAt,
    });
  }
  return profiles;
}

export interface IniSection {
  name: string;
  /** Keys are lower-cased: `profiles.ini` is not consistent about their case across versions. */
  values: Map<string, string>;
}

export function parseIniSections(text: string): IniSection[] {
  const sections: IniSection[] = [];
  let current: IniSection | null = null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
    const header = /^\[(.+)\]$/.exec(trimmed);
    if (header !== null) {
      current = { name: header[1]!.trim(), values: new Map() };
      sections.push(current);
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0 || current === null) continue;
    current.values.set(
      trimmed.slice(0, eq).trim().toLowerCase(),
      trimmed.slice(eq + 1).trim().slice(0, 4096),
    );
  }
  return sections;
}

/** The handle the renderer sees. Truncated SHA-256 of the absolute path: stable across two detection
 *  runs in the same session, and not reversible into the path it stands for. */
function profileId(source: BrowserImportSource, path: string): string {
  return `${source}:${createHash('sha256').update(path).digest('hex').slice(0, 24)}`;
}

function readDirNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function modifiedTime(file: string): number | null {
  try {
    const stat = statSync(file);
    return stat.isFile() ? stat.mtimeMs : null;
  } catch {
    return null;
  }
}

/** Read a small text file, refusing anything implausibly large before it is turned into a string. */
function readTextFile(file: string, maxBytes: number): string | null {
  try {
    if (statSync(file).size > maxBytes) return null;
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
