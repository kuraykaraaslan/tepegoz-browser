import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const RESERVED_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

export function cleanFilename(filename: string): string {
  const cleaned = [...basename(filename)]
    .map((ch) => (RESERVED_FILENAME_CHARS.has(ch) || ch.charCodeAt(0) < 32 ? '_' : ch))
    .join('')
    .trim()
    // Windows drops trailing dots and spaces from a path component on creation, so `evil.exe.` is
    // written (and executed) as `evil.exe`. Strip them here too, or the record's filename/finalPath
    // disagree with what is actually on disk and reveal-in-folder points at nothing.
    .replace(/[.\s]+$/u, '');
  return cleaned.length > 0 ? cleaned : 'download';
}

export function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (err) {
    if (!hasCode(err, 'EXDEV')) throw err;
    await copyFile(from, to);
    await unlink(from);
  }
}

export function uniquePath(dir: string, filename: string): string {
  const safe = cleanFilename(filename);
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  let candidate = join(dir, safe);
  let i = 1;
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem} (${i})${ext}`);
    i += 1;
  }
  return candidate;
}
