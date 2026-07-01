import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

/**
 * Tiny JSON file helpers for main-process stores (credentials, preferences). Node-only (no Electron),
 * so the stores that use them stay unit-testable. Callers MUST validate the returned shape (zod) —
 * the file is on disk and could be corrupted or tampered with.
 */
export function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Crash-safe write: serialize to a sibling temp file, fsync it, then atomically rename over the
 * target (rename is atomic on the same volume). This prevents a crash/power-loss mid-write from
 * leaving a truncated/invalid file — critical for the encrypted credential vault, where a corrupt
 * file would otherwise be silently overwritten with an empty map on the next mutation.
 */
export function writeJsonFile(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const contents = JSON.stringify(data, null, 2);
  const fd = openSync(tmpPath, 'w');
  try {
    writeSync(fd, contents, null, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, filePath);
}
