import { accessSync, constants } from 'node:fs';
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
 *   3. `PATH` — for a package manager install.
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
  ];
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
