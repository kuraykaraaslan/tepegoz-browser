import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `openWithRepair` — ADR-0038's corrupt-profile recovery. An open or migration failure used to leave
 * `db = null` forever: the browser ran, but with no history/bookmarks/journal until the user found
 * and deleted the file by hand. Now the unreadable file is renamed aside (nothing destroyed) and a
 * fresh database is opened in its place; only if THAT also fails does persistence stay off.
 */

const persistence = vi.hoisted(() => ({
  openDatabase: vi.fn(() => ({ tag: 'db' })),
  migrate: vi.fn(),
  HistoryStore: { reindexFoldsIfStale: vi.fn(() => 0), prune: vi.fn(() => 0) },
  AgentConversationStore: { reindexFoldsIfStale: vi.fn(() => 0) },
}));
const bookmarks = vi.hoisted(() => ({
  BookmarkTreeStore: { reindexFoldsIfStale: vi.fn(() => 0) },
}));
const fs = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  renameSync: vi.fn<(from: string, to: string) => void>(),
}));

vi.mock('@tepegoz/persistence', () => persistence);
vi.mock('@tepegoz/bookmarks', () => bookmarks);
vi.mock('node:fs', () => fs);
vi.mock('electron', () => ({ app: { getPath: () => '/ud' } }));
vi.mock('@tepegoz/libs', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { openWithRepair } = await import('./database.electron');

const DB_PATH = '/ud/tepegoz.db';

beforeEach(() => {
  vi.clearAllMocks();
  persistence.openDatabase.mockReturnValue({ tag: 'db' });
  persistence.migrate.mockReturnValue(undefined);
  fs.renameSync.mockReturnValue(undefined);
});

describe('openWithRepair', () => {
  it('returns the opened database and moves nothing on the happy path', () => {
    const db = openWithRepair(DB_PATH);
    expect(db).toEqual({ tag: 'db' });
    expect(persistence.migrate).toHaveBeenCalledOnce();
    expect(fs.renameSync).not.toHaveBeenCalled();
  });

  it('quarantines the file and its sidecars, then opens a fresh one, when the open fails', () => {
    persistence.openDatabase
      .mockImplementationOnce(() => {
        throw new Error('SQLITE_CORRUPT: database disk image is malformed');
      })
      .mockReturnValueOnce({ tag: 'fresh' });

    const db = openWithRepair(DB_PATH);

    expect(db).toEqual({ tag: 'fresh' });
    // Main file + both WAL sidecars renamed to a timestamped `.corrupt-` name; nothing deleted.
    const targets = fs.renameSync.mock.calls.map((c) => [c[0], c[1]]);
    expect(targets).toContainEqual([DB_PATH, expect.stringMatching(/tepegoz\.db\.corrupt-.+$/u)]);
    expect(targets).toContainEqual([
      `${DB_PATH}-wal`,
      expect.stringMatching(/tepegoz\.db\.corrupt-.+-wal$/u),
    ]);
    expect(persistence.openDatabase).toHaveBeenCalledTimes(2);
  });

  it('also recovers when the OPEN succeeds but the migration throws', () => {
    persistence.migrate
      .mockImplementationOnce(() => {
        throw new Error('half-applied migration 21');
      })
      .mockReturnValueOnce(undefined);

    expect(openWithRepair(DB_PATH)).toEqual({ tag: 'db' });
    expect(fs.renameSync).toHaveBeenCalled();
    expect(persistence.migrate).toHaveBeenCalledTimes(2);
  });

  it('proceeds to the fresh open even when a WAL sidecar is absent', () => {
    persistence.openDatabase
      .mockImplementationOnce(() => {
        throw new Error('corrupt');
      })
      .mockReturnValueOnce({ tag: 'fresh' });
    // Only the main file renames; the sidecars do not exist.
    fs.renameSync.mockImplementation((from: string) => {
      if (from !== DB_PATH) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    expect(openWithRepair(DB_PATH)).toEqual({ tag: 'fresh' });
  });

  it('gives up (persistence off) when the unreadable file cannot be moved', () => {
    persistence.openDatabase.mockImplementation(() => {
      throw new Error('corrupt');
    });
    fs.renameSync.mockImplementation(() => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    });

    expect(openWithRepair(DB_PATH)).toBeNull();
    // The main file never moved, so we must not have tried a second open on top of it.
    expect(persistence.openDatabase).toHaveBeenCalledTimes(1);
  });

  it('gives up when the fresh database also fails to open', () => {
    persistence.openDatabase.mockImplementation(() => {
      throw new Error('corrupt and the disk is failing');
    });
    // rename succeeds (default), so we reach the retry — which also throws.
    expect(openWithRepair(DB_PATH)).toBeNull();
    expect(persistence.openDatabase).toHaveBeenCalledTimes(2);
  });
});
