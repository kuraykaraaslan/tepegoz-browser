import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Bundle `tepegoz-verify` into ONE self-contained ESM file (Phase 7 NotaryService).
 *
 * The monorepo's own tsconfig uses `moduleResolution: "bundler"`, which is correct for how every other
 * package here is consumed — as TypeScript source, resolved by Vite/Vitest/electron-vite, which handle
 * extensionless relative imports themselves. It is the WRONG setting for a leaf artifact meant to run
 * under plain Node with nothing else installed: a plain `tsc` build under that resolution mode emits
 * `from './hash-chain'` with no extension, which Node's own ESM loader refuses to resolve. Running
 * `tepegoz-verify` on a real machine would fail before it ever read a receipt.
 *
 * Bundling with esbuild sidesteps the mismatch entirely — every relative import is inlined, so there is
 * nothing left for Node to resolve. The only imports that survive in the output are `node:*` builtins
 * (explicitly kept external below), which is what makes the result runnable with zero dependencies: no
 * `node_modules`, no `pnpm install`, no tepegöz checkout. `node dist/tepegoz-verify.mjs receipt.json` is
 * the entire contract.
 */
const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(here, '..', 'src', 'cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: join(here, '..', 'dist', 'tepegoz-verify.mjs'),
  external: ['node:*'],
  // No banner here: esbuild already carries the `#!/usr/bin/env node` shebang from the top of cli.ts
  // into the bundle. Adding a second one produced two shebang lines, and Node's ESM loader only
  // special-cases the literal first line — the duplicate became a syntax error.
});

console.log(
  'built dist/tepegoz-verify.mjs (standalone — bundled, no node_modules required to run)',
);
