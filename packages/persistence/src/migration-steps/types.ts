import type { Db } from '../db';

/** One forward-only schema step; `version` is the PRAGMA `user_version` it advances the database to. */
export interface Migration {
  version: number;
  up: (db: Db) => void;
}
