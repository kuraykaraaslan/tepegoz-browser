import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

export function writeJsonFile(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}
