import { DatabaseSync, type StatementSync } from 'node:sqlite';

/**
 * SQLite (L1) on Node's BUILT-IN `node:sqlite`.
 *
 * This used to be `better-sqlite3`, and the reason for moving is not preference. One `.node` file
 * matches one ABI, and better-sqlite3 publishes **no Electron prebuilds at any version** — so the
 * Electron-ABI build always compiled from source and needed a C++ toolchain. That single fact produced:
 * a `rebuild` script, a `test:electron` runner, an `electron-rebuild` step in two CI jobs, an ABI note
 * in CLAUDE.md, a skip-guard so 63 tests could sit out a run they could not survive, and a standing
 * "don't flip the binary back and forth" rule. All of it existed to work around a compiler dependency.
 *
 * `node:sqlite` ships inside the runtime, so there is nothing to rebuild and nothing to match: the same
 * code runs under `node` and under Electron's Node, which is why the repo's Node floor is now the one
 * Electron 43 embeds.
 *
 * The surface below is deliberately the better-sqlite3 shape (`prepare`/`get`/`all`/`run`/`exec`/
 * `pragma`/`transaction`), because ~600 call sites across the stores speak it. Behaviour verified equal
 * on the parts that matter: bare `@named` parameters, positional `?`, `{ changes, lastInsertRowid }` as
 * numbers, and `undefined` from a `get()` that matches no row. The one genuine difference is BLOBs,
 * which arrive as `Uint8Array` and are re-wrapped as `Buffer` here so the stores keep their types.
 */

/** What `.run()` reports. Numbers, not BigInt — matching what the stores already assume. */
export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Stmt {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): RunResult;
}

export interface Db {
  prepare(sql: string): Stmt;
  exec(sql: string): void;
  /** `pragma('foo = 1')` to set; `pragma('foo', { simple: true })` for the scalar value. */
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  /** Wrap `fn` so it runs inside a transaction, rolling back if it throws. Nests via SAVEPOINT. */
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  close(): void;
}

/** BLOB columns arrive as Uint8Array; the stores are typed against Buffer. Wrap, never copy. */
function asBuffer(value: unknown): unknown {
  return value instanceof Uint8Array && !Buffer.isBuffer(value)
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    : value;
}

/** Rows come back null-prototype; rebuild as plain objects with BLOBs re-wrapped. */
function normalizeRow(row: unknown): unknown {
  if (row === undefined || row === null || typeof row !== 'object') return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) out[k] = asBuffer(v);
  return out;
}

function wrapStatement(stmt: StatementSync): Stmt {
  // The stores pass bare-keyed objects for `@named` parameters (better-sqlite3 style).
  stmt.setAllowBareNamedParameters(true);
  return {
    get: (...params) => normalizeRow(stmt.get(...(params as never[]))),
    all: (...params) => stmt.all(...(params as never[])).map(normalizeRow),
    run: (...params) => {
      const r = stmt.run(...(params as never[]));
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
  };
}

/**
 * Open a database. WAL + synchronous=NORMAL gives good durability without fsync on every write.
 * Pass ':memory:' for tests.
 */
export function openDatabase(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  // SQLite defaults to failing immediately with SQLITE_BUSY. Electron's main loop is single-threaded
  // today, but WAL checkpoints and future utilityProcess workers contend for the write lock — retry for
  // up to 5s instead of surfacing spurious busy errors.
  db.exec('PRAGMA busy_timeout = 5000');

  /** Depth counter so a nested `transaction()` uses SAVEPOINTs instead of a doomed nested BEGIN. */
  let depth = 0;

  const api: Db = {
    prepare: (sql) => wrapStatement(db.prepare(sql)),
    exec: (sql) => {
      db.exec(sql);
    },
    pragma: (sql, options) => {
      if (options?.simple !== true) {
        db.exec(`PRAGMA ${sql}`);
        return undefined;
      }
      const row = db.prepare(`PRAGMA ${sql}`).get() as Record<string, unknown> | undefined;
      // `PRAGMA user_version` answers `{ user_version: 0 }`; `simple` means "just the value".
      return row === undefined ? undefined : Object.values(row)[0];
    },
    transaction: <T extends (...args: never[]) => unknown>(fn: T): T =>
      ((...args: never[]) => {
        const savepoint = `sp_${String(depth)}`;
        db.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
        depth += 1;
        try {
          const result = fn(...args);
          depth -= 1;
          db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
          return result;
        } catch (err) {
          depth -= 1;
          db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}`);
          throw err;
        }
      }) as T,
    close: () => {
      db.close();
    },
  };
  return api;
}
