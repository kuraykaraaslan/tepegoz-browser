import { accessSync, constants, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { app } from 'electron';
import PreferenceStore from '@tepegoz/preferences';

/**
 * Finding the helper binaries the userspace providers run (Phase 5).
 *
 * `wireproxy` (userspace WireGuard with a SOCKS5 listener) and `tor` are separate programs. This app
 * deliberately does **not** bundle them: shipping a third-party executable inside a signed installer is a
 * distribution problem (Phase 0 code-signing), and neither is needed by anyone who does not turn the
 * feature on. So they are located, not installed — and if one is missing the connection reports down with
 * a message that says exactly what to do, rather than failing somewhere deeper with a confusing error.
 *
 * Search order, most explicit first:
 *   1. the path the user set in Settings — an override always wins;
 *   2. `userData/bin/<name>` — the drop-in spot the UI points at;
 *   3. `PATH` — for a package-manager install;
 *   4. the places these two programs actually land when installed normally.
 *
 * Step 4 is what makes the common case need no setup at all: someone who already has Tor Browser or
 * installed either tool with scoop/homebrew/apt should find the feature simply works. It is a list of
 * KNOWN locations rather than a filesystem crawl — scanning the disk for an executable would be both slow
 * and a rude thing for a browser to do unasked.
 */

export type VpnBinary = 'wireproxy' | 'tor';

export class MissingBinaryError extends Error {
  constructor(readonly binary: VpnBinary) {
    super(`${binary} was not found`);
    this.name = 'MissingBinaryError';
  }
}

function isExecutable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Windows needs the extension; POSIX does not. Kept in one place so callers never spell it out. */
function fileNames(binary: VpnBinary): string[] {
  return process.platform === 'win32' ? [`${binary}.exe`] : [binary];
}

function configuredPath(binary: VpnBinary): string {
  const paths = PreferenceStore.getAll().networkBinaries;
  return binary === 'wireproxy' ? paths.wireproxy : paths.tor;
}

/**
 * Where each program actually lives after a normal install.
 *
 * Tor is the awkward one: the Expert Bundle is a zip the user extracts wherever they like, and Tor
 * Browser buries its copy several directories deep. Both shapes are listed, because "I already have Tor
 * Browser" is by far the most likely way someone arrives at this feature with Tor already on disk.
 */
function wellKnownPaths(binary: VpnBinary): string[] {
  const home = app.getPath('home');
  if (process.platform === 'win32') {
    // Forward slashes throughout: `join` normalises them on Windows, and a literal backslash
    // in a TS string is an escape sequence waiting to be got wrong.
    const programFiles = process.env['ProgramFiles'] ?? 'C:/Program Files';
    const localAppData = process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local');
    if (binary === 'tor') {
      // Tor Browser keeps its copy at <root>/Browser/TorBrowser/Tor/tor.exe.
      const browserRoots = [
        join(localAppData, 'Programs', 'Tor Browser'),
        join(programFiles, 'Tor Browser'),
        join(app.getPath('desktop'), 'Tor Browser'),
        join(home, 'Tor Browser'),
      ];
      return [
        ...browserRoots.map((r) => join(r, 'Browser', 'TorBrowser', 'Tor', 'tor.exe')),
        // Expert Bundle, extracted to the usual spots.
        join('C:/tor', 'tor', 'tor.exe'),
        join('C:/tor', 'tor.exe'),
        join(home, 'scoop', 'apps', 'tor', 'current', 'tor.exe'),
        join(home, 'scoop', 'shims', 'tor.exe'),
        join('C:/ProgramData', 'chocolatey', 'bin', 'tor.exe'),
      ];
    }
    return [
      join(programFiles, 'wireproxy', 'wireproxy.exe'),
      join(home, 'scoop', 'apps', 'wireproxy', 'current', 'wireproxy.exe'),
      join(home, 'scoop', 'shims', 'wireproxy.exe'),
      join('C:/ProgramData', 'chocolatey', 'bin', 'wireproxy.exe'),
    ];
  }
  const unix = ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/opt/local/bin', join(home, '.local', 'bin')];
  const extra =
    binary === 'tor' && process.platform === 'darwin'
      ? ['/Applications/Tor Browser.app/Contents/MacOS/Tor/tor']
      : [];
  return [...unix.map((d) => join(d, binary)), ...extra];
}

/** Where the UI tells the user to drop the file, and where a future auto-download would land it. */
export function binDir(): string {
  return join(app.getPath('userData'), 'bin');
}

/** Every place {@link locateBinary} looks, in order — shown in the UI when a binary is missing. */
export function searchPaths(binary: VpnBinary): string[] {
  const names = fileNames(binary);
  const fromPath = (process.env['PATH'] ?? '').split(delimiter).filter((p) => p.length > 0);
  return [
    ...(configuredPath(binary).length > 0 ? [configuredPath(binary)] : []),
    ...names.map((n) => join(binDir(), n)),
    ...fromPath.flatMap((dir) => names.map((n) => join(dir, n))),
    ...wellKnownPaths(binary),
  ];
}

/**
 * Look for the binary inside a folder the user picked.
 *
 * A folder rather than the file itself, because "where did I put Tor Browser" is a question people can
 * answer and "which of these forty files is the executable" is not. The search is breadth-first and
 * BOUNDED — depth and visited-directory caps — so picking a large folder by mistake cannot hang the app;
 * the depth is enough to reach Tor Browser's `Browser/TorBrowser/Tor/tor.exe` from its root.
 */
export function findBinaryInFolder(binary: VpnBinary, folder: string): string | null {
  const names = new Set(fileNames(binary));
  const queue: { dir: string; depth: number }[] = [{ dir: folder, depth: 0 }];
  let visited = 0;
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    if (visited > 400) break;
    visited += 1;
    let entries;
    try {
      entries = readdirSync(next.dir, { withFileTypes: true });
    } catch {
      continue; // unreadable directory — skip rather than abandon the whole search
    }
    for (const entry of entries) {
      const full = join(next.dir, entry.name);
      if (entry.isFile() && names.has(entry.name) && isExecutable(full)) return full;
      if (entry.isDirectory() && next.depth < 4) queue.push({ dir: full, depth: next.depth + 1 });
    }
  }
  return null;
}

/**
 * The absolute path to a helper binary. Throws {@link MissingBinaryError} when there is none — the pool
 * turns that into a connection that is `down` for a stated reason, which is the honest outcome: we cannot
 * tunnel, and we are not going to pretend otherwise by falling back to anything.
 */
export function locateBinary(binary: VpnBinary): string {
  for (const candidate of searchPaths(binary)) {
    if (isExecutable(candidate)) return candidate;
  }
  throw new MissingBinaryError(binary);
}

export function hasBinary(binary: VpnBinary): boolean {
  try {
    locateBinary(binary);
    return true;
  } catch {
    return false;
  }
}
