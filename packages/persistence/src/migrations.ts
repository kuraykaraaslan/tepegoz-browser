import type { Db } from './db';
import type { Migration } from './migration-steps/types';
import { MIGRATIONS_V01_V10 } from './migration-steps/v01-v10';
import { MIGRATIONS_V11_V20 } from './migration-steps/v11-v20';
import { MIGRATIONS_V21_V27 } from './migration-steps/v21-v27';

/** Contain the `unknown` pragma return in one typed place. */
function userVersion(db: Db): number {
  const v: unknown = db.pragma('user_version', { simple: true });
  return typeof v === 'number' ? v : 0;
}

const MIGRATIONS: Migration[] = [
  ...MIGRATIONS_V01_V10,
  ...MIGRATIONS_V11_V20,
  ...MIGRATIONS_V21_V27,
];

/**
 * Apply all pending migrations inside a transaction (migration-safe: forward-only, versioned via
 * PRAGMA user_version). Returns the resulting schema version.
 */
export function migrate(db: Db): number {
  const current = userVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  const run = db.transaction(() => {
    for (const m of pending) {
      m.up(db);
      db.pragma(`user_version = ${String(m.version)}`);
    }
  });
  run();
  return userVersion(db);
}
