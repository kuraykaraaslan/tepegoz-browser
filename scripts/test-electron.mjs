// Runs vitest under Electron's bundled Node (ELECTRON_RUN_AS_NODE=1) so tests that load the native
// `better-sqlite3` addon work against the *Electron-ABI* binary that `pnpm --filter @tepegoz/desktop
// rebuild` produces (the normal LOCAL state after you've run the app).
//
// Why this exists: one on-disk `.node` file can only match one ABI. CI does a fresh install → the
// Node-ABI prebuild → plain `pnpm test` (Node/vitest) passes there. Locally, once you rebuild for
// Electron 33 (ABI 130) to launch the app, `pnpm test` can no longer load that addon under Node 22
// (ABI 127). Rather than flip the binary back and forth, run the native-touching tests under
// Electron's own Node — the existing 130 binary serves both the app and these tests, untouched.
//
// Usage: `pnpm test:electron` (defaults to the persistence package — the only native-dependent one)
//        `pnpm test:electron -- --root packages/persistence -t readRecent`  (pass-through vitest args)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The `electron` package resolves to its executable path when imported from Node.
const electronPath = require('electron');
const vitestBin = require.resolve('vitest/vitest.mjs');

const passthrough = process.argv.slice(2);
const args =
  passthrough.length > 0
    ? passthrough
    : [
        'run',
        '--pool=forks',
        '--poolOptions.forks.singleFork=true',
        '--root',
        'packages/persistence',
      ];

const child = spawn(electronPath, [vitestBin, ...args], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
child.on('exit', (code) => {
  process.exit(code ?? 0);
});
