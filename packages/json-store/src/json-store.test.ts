import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './json-store';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tepegoz-json-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('json-store', () => {
  it('round-trips JSON, creating parent dirs, and leaves no temp file', () => {
    const file = join(dir, 'nested', 'data.json');
    writeJsonFile(file, { a: 1, b: 'x' });
    expect(readJsonFile(file)).toEqual({ a: 1, b: 'x' });
    // Atomic write must not leave its sibling temp file behind.
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('overwrites atomically (no partial state observed after a second write)', () => {
    const file = join(dir, 'data.json');
    writeJsonFile(file, { v: 1 });
    writeJsonFile(file, { v: 2 });
    expect(readJsonFile(file)).toEqual({ v: 2 });
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('returns undefined for a missing file', () => {
    expect(readJsonFile(join(dir, 'nope.json'))).toBeUndefined();
  });

  it('returns undefined for a corrupt (truncated) file instead of throwing', () => {
    const file = join(dir, 'bad.json');
    writeFileSync(file, '{ "a": 1, "b":', 'utf8'); // truncated mid-write, as a crash would leave it
    expect(readJsonFile(file)).toBeUndefined();
  });
});
