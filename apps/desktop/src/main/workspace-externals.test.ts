import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A workspace package DECLARED as a dependency must also be listed as bundled.
 *
 * `externalizeDepsPlugin` externalizes exactly what `package.json` declares. Workspace packages expose
 * TypeScript source through their `exports`, so an externalized one makes Electron `import` a `.ts`
 * file at runtime — which fails at LAUNCH, after typecheck, lint, unit tests and the build are all
 * green. `WORKSPACE_PACKAGES` in `electron.vite.config.ts` is the opt-out list, and it is maintained by
 * hand.
 *
 * That combination bit exactly once, when `@tepegoz/shortcuts` was added as a dependency without the
 * matching config line: the whole e2e suite went from 24 passing to 24 thirty-second timeouts, with no
 * error in the log — the app simply never came up. This test is the cheap version of that discovery.
 *
 * Two conditions have to meet for the crash, and the test checks their intersection rather than either
 * alone. Most workspace packages are NOT declared here — they resolve through the workspace root, so
 * nothing externalizes them and they never needed a line. And three of the four that ARE declared are
 * renderer-only React packages that main never imports, so externalizing them is harmless. What breaks
 * is a package that is both declared AND imported by main or preload.
 */

const PKG = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};
const CONFIG = readFileSync(join(__dirname, '..', '..', 'electron.vite.config.ts'), 'utf8');

function bundled(): Set<string> {
  const start = CONFIG.indexOf('const WORKSPACE_PACKAGES = [');
  const end = CONFIG.indexOf('];', start);
  if (start === -1 || end === -1)
    throw new Error('WORKSPACE_PACKAGES not found in the vite config');
  return new Set(
    [...CONFIG.slice(start, end).matchAll(/'(@tepegoz\/[^']+)'/g)].map((m) => m[1] as string),
  );
}

const declared = Object.keys(PKG.dependencies ?? {}).filter((d) => d.startsWith('@tepegoz/'));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) return [];
    return [full];
  });
}

/** Workspace packages main/preload import, mapped to one importing file for the failure message. */
function importedByNode(): Map<string, string> {
  const found = new Map<string, string>();
  for (const dir of [__dirname, join(__dirname, '..', 'preload')]) {
    for (const file of sources(dir)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from '(@tepegoz\/[a-z0-9-]+)(?:\/[^']*)?'/g)) {
        found.set(m[1] as string, file.split(sep).slice(-2).join('/'));
      }
    }
  }
  return found;
}

describe('declared workspace dependencies are bundled, never externalized', () => {
  it('read all three sides (the check is not comparing empty sets)', () => {
    expect(bundled().size).toBeGreaterThan(10);
    expect(declared.length).toBeGreaterThan(0);
    expect(importedByNode().size).toBeGreaterThan(10);
  });

  it('lists every declared dependency that main or preload actually imports', () => {
    const list = bundled();
    const imports = importedByNode();
    const missing = declared
      .filter((d) => imports.has(d) && !list.has(d))
      .map((d) => `${d} (imported by ${imports.get(d) ?? '?'})`);
    expect(missing).toEqual([]);
  });
});
