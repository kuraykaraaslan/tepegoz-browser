import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keyPaths } from './testing';

/**
 * Every dictionary in the repository, checked at once.
 *
 * Each owner package already has its own parity test, and that is the right place for it — but it is
 * also a test somebody has to REMEMBER to write. Enumerating showed exactly what that costs:
 * seventeen of the eighteen dictionaries were guarded and `@tepegoz/reader`'s was not, silently, for
 * as long as it has existed. Nothing failed, because nothing was looking.
 *
 * So this walks the tree instead of trusting a list. A new package's dictionary is covered the day it
 * lands, and the phase DoD line "en+tr keys added for all new surfaces" becomes a thing CI can answer
 * rather than a thing someone attests to.
 *
 * Two rules keep it honest:
 *
 *  - **A directory it cannot read is a FAILURE, never a skip.** A test that quietly passes over the
 *    one dictionary shaped differently is worse than no test, because it reports coverage it does not
 *    have.
 *  - **It asserts a non-trivial count**, so a broken walk (a moved root, a changed layout) fails loudly
 *    instead of passing with zero dictionaries found.
 */

/** Repo root, found by walking up from this file until `pnpm-workspace.yaml` appears. */
function repoRoot(): string {
  let dir = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = resolve(dir, '..');
  }
  throw new Error('repo root not found — the dictionary sweep would silently cover nothing');
}

/**
 * The workspace's own top-level groups, read from `pnpm-workspace.yaml` rather than hardcoded.
 *
 * This is not tidiness. The first version of this sweep hardcoded `['packages', 'apps']` and therefore
 * covered eighteen dictionaries while silently missing the nine under `extensions/` — including
 * `ext-translate`, which the phase DoD line names by hand. A sweep that decides for itself what to
 * walk will keep being wrong in exactly that way; reading the workspace file means a new group is
 * covered the day it is added.
 */
function workspaceGroups(root: string): string[] {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const groups = [...yaml.matchAll(/^\s*-\s*'?([A-Za-z0-9_-]+)\/\*'?\s*$/gm)].map((m) => m[1]!);
  if (groups.length === 0) throw new Error('no workspace groups parsed — the sweep would cover nothing');
  return groups;
}

/** Every `…/src/i18n` directory in the workspace. */
function dictionaryDirs(root: string): string[] {
  const found: string[] = [];
  for (const group of workspaceGroups(root)) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir)) {
      // `apps/desktop/src/i18n`, `packages/<name>/src/i18n`, `extensions/<name>/src/i18n`.
      const candidate = join(groupDir, entry, 'src', 'i18n');
      if (existsSync(candidate) && statSync(candidate).isDirectory()) found.push(candidate);
    }
  }
  return found.sort();
}

const ROOT = repoRoot();
const DIRS = dictionaryDirs(ROOT);

describe('every dictionary in the repo has en+tr, aligned', () => {
  it('found the dictionaries at all', () => {
    // A walk that returns nothing would make every case below vacuously pass.
    expect(DIRS.length).toBeGreaterThan(10);
  });

  for (const dir of DIRS) {
    const name = relative(ROOT, dir).replace(/\\/g, '/');

    it(`${name} ships both locales`, () => {
      expect(existsSync(join(dir, 'en.ts'))).toBe(true);
      // The product's second language is first-class, which means "the English shipped and the
      // Turkish is coming" is not a state this repo has.
      expect(existsSync(join(dir, 'tr.ts'))).toBe(true);
    });

    it(`${name} has the same keys in both`, async () => {
      const en = (await import(/* @vite-ignore */ join(dir, 'en.ts'))) as Record<string, unknown>;
      const tr = (await import(/* @vite-ignore */ join(dir, 'tr.ts'))) as Record<string, unknown>;
      // Each module exports its dictionaries by name (`en`, `tr`, or several for a package that owns
      // more than one). Compare every exported object pairwise by export name, so a package with
      // `browser`/`transfer`/`userMenu` dictionaries is covered per dictionary rather than in bulk.
      const exportNames = Object.keys(en).filter(
        (key) => typeof en[key] === 'object' && en[key] !== null,
      );
      expect(exportNames.length).toBeGreaterThan(0);

      for (const exportName of exportNames) {
        const trValue = tr[exportName] ?? tr[exportName.replace(/^en/, 'tr')];
        expect(trValue, `${name}: ${exportName} has no Turkish counterpart`).toBeDefined();
        expect(
          keyPaths(trValue as Record<string, unknown>).sort(),
          `${name}: ${exportName} keys differ between en and tr`,
        ).toEqual(keyPaths(en[exportName] as Record<string, unknown>).sort());
      }
    });
  }
});
