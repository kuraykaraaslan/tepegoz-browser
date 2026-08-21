import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `electron-builder.yml` pins `electronVersion` by hand, because pnpm's hoisted linker puts electron at
 * the monorepo root where electron-builder cannot auto-detect it from `projectDir`. A hand-pinned
 * version drifts silently: the `electron` devDependency was bumped while that line still read 33.4.11,
 * which would have shipped an installer built against a different Electron than the app was developed
 * and tested on — the native addon rebuilt for the wrong ABI, and none of the other gates would notice,
 * because nothing else reads that file.
 */
describe('electron-builder electronVersion', () => {
  it('matches the resolved electron dependency', () => {
    const yml = readFileSync(join(__dirname, '../../electron-builder.yml'), 'utf8');
    const pinned = /^electronVersion:\s*(\S+)\s*$/m.exec(yml)?.[1];
    expect(pinned, 'electronVersion is missing from electron-builder.yml').toBeDefined();

    const require_ = createRequire(import.meta.url);
    const resolved = (require_('electron/package.json') as { version: string }).version;

    expect(
      pinned,
      `electron-builder.yml pins ${String(pinned)} but the installed electron is ${resolved}. ` +
        'Update the yml (and re-run the native rebuild) so the packaged app matches the tested one.',
    ).toBe(resolved);
  });
});
