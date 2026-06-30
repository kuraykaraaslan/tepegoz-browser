import Database from 'better-sqlite3';

export type Db = Database.Database;

/**
 * Open a SQLite database (L1). WAL + synchronous=NORMAL gives good durability without fsync on every
 * write. Pass ':memory:' for tests. The native module is rebuilt against Electron's ABI at packaging
 * time (electron-builder install-app-deps); under Node (tests) it uses the Node prebuilt.
 */
export function openDatabase(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  return db;
}
