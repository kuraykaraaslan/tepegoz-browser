import Database from 'better-sqlite3';

/**
 * Is the `better-sqlite3` native addon loadable in THIS runtime?
 *
 * One `.node` file matches one ABI. A plain `pnpm install` fetches the Node prebuild; running the GUI
 * needs the Electron rebuild — so on a developer machine that has launched the app, every test that
 * touches SQLite dies with `NODE_MODULE_VERSION 130 ... requires 127`. That was the standing state:
 * `pnpm exec turbo run typecheck lint test` — the command CLAUDE.md leads with — could not be green
 * locally, by design, with 63 red tests explained away in prose. A suite that is always red stops being
 * read, and the next real failure hides inside the noise.
 *
 * So the mismatch is now a REASONED skip rather than a failure... which would be its own lie if nothing
 * checked. `TEPEGOZ_REQUIRE_NATIVE=1` turns the skip back into a hard failure, and CI sets it: the
 * tests must actually RUN somewhere, and CI is where. Locally they skip with a message naming the fix;
 * in CI (and under `pnpm test:electron`) a skip is a build break.
 */
let cached: boolean | null = null;

export function isNativeSqliteLoadable(): boolean {
  if (cached !== null) return cached;
  try {
    new Database(':memory:').close();
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

/** Message shown on the skip, so nobody has to go hunting for why a suite vanished. */
export const NATIVE_SQLITE_SKIP_REASON =
  'better-sqlite3 is built for a different ABI than this runtime — run `pnpm test:electron` ' +
  '(or `pnpm --filter @tepegoz/desktop rebuild` to switch back). Set TEPEGOZ_REQUIRE_NATIVE=1 to fail ' +
  'instead of skipping.';

/**
 * `describe`/`it` guard: true when the suite should be skipped. Throws when the runtime demands the
 * native path (CI, `pnpm test:electron`), so "skipped everywhere forever" cannot pass unnoticed.
 */
export function skipWithoutNativeSqlite(): boolean {
  if (isNativeSqliteLoadable()) return false;
  if (process.env.TEPEGOZ_REQUIRE_NATIVE === '1') {
    throw new Error(`Native SQLite required but not loadable. ${NATIVE_SQLITE_SKIP_REASON}`);
  }
  return true;
}
