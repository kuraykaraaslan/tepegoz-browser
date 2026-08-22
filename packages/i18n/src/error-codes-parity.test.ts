import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './locales/en';
import { tr } from './locales/tr';

/**
 * Every `AppError` code that exists in the source has a user-facing string, in both locales.
 *
 * `AppError`'s own docblock explains the split: `message` stays English for the log and for the
 * model's recovery matching, and `code` is what the human boundary translates. That makes a missing
 * translation invisible in exactly the way that matters — `localizeError` returns `undefined`, the
 * boundary falls back to `localized ?? err.message`, and a Turkish user is shown the English operator
 * message. Nothing throws, nothing logs, and the failure only surfaces to someone who hits that error
 * in that locale.
 *
 * This scan closes that. It is the same shape as `permissions-parity.test.ts` and exists for the same
 * reason: the explanation should be written by whoever writes the rule, not reconstructed later.
 */

const ROOT = join(__dirname, '..', '..', '..');
const SCAN = ['apps', 'packages', 'extensions'].map((d) => join(ROOT, d));
const SKIP = new Set(['node_modules', 'dist', 'out', '.turbo', 'coverage']);
/** `new AppError('msg', 500, 'code')` — the third argument, when one is given as a literal. */
const CODED = /new AppError\(\s*(?:[^;]*?),\s*\d{3},\s*'([a-zA-Z][a-zA-Z0-9_]*)'/gs;

function sources(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) return [];
    return [full];
  });
}

interface Use {
  code: string;
  where: string;
}

const USES: Use[] = SCAN.flatMap(sources).flatMap((file) => {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(CODED)].map((m) => ({
    code: m[1] as string,
    where: file
      .slice(ROOT.length + 1)
      .split(sep)
      .join('/'),
  }));
});

const errorsEn: Record<string, string> = en.errors;
const errorsTr: Record<string, string> = tr.errors;

describe('every AppError code reaches the user in their own language', () => {
  it('found the call sites (the scan is not silently empty)', () => {
    expect(USES.length).toBeGreaterThan(20);
  });

  it('has an English string for every code thrown anywhere in the source', () => {
    const missing = [
      ...new Set(USES.filter((u) => !(u.code in errorsEn)).map((u) => `${u.code} (${u.where})`)),
    ];
    expect(missing).toEqual([]);
  });

  it('has a Turkish string for every one of them', () => {
    const missing = [
      ...new Set(USES.filter((u) => !(u.code in errorsTr)).map((u) => `${u.code} (${u.where})`)),
    ];
    expect(missing).toEqual([]);
  });

  it('is translated rather than copied', () => {
    const copied = [...new Set(USES.map((u) => u.code))].filter(
      (code) => code in errorsEn && errorsEn[code] === errorsTr[code],
    );
    expect(copied).toEqual([]);
  });
});
