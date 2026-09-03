import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `database.electron` — the single SQLite connector for the user-data dir, with ADR-0038's
 * quarantine-and-restart recovery rung. Pinned: `openWithRepair` returns the opened+migrated DB, and
 * on failure renames the file (and `-wal`/`-shm` sidecars) aside and opens a fresh one (null only when
 * even that fails, or the main file cannot be moved); `initDatabase` creates the Extensions dir, wires
 * `getDb`, defers the history/bookmark/conversation re-fold + prune to `setImmediate`, and is
 * idempotent; and `closeDatabase` closes once and leaves `getDb()` null.
 */

const fs = vi.hoisted(() => ({ mkdirSync: vi.fn(), renameSync: vi.fn() }));
vi.mock('node:fs', () => fs);
vi.mock('electron', () => ({ app: { getPath: () => '/userData' } }));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const openDatabase = vi.hoisted(() => vi.fn(() => ({ close: vi.fn() })));
const migrate = vi.hoisted(() => vi.fn());
const HistoryStore = vi.hoisted(() => ({
  reindexFoldsIfStale: vi.fn(() => 0),
  prune: vi.fn(() => 0),
}));
const AgentConversationStore = vi.hoisted(() => ({ reindexFoldsIfStale: vi.fn(() => 0) }));
vi.mock('@tepegoz/persistence', () => ({
  openDatabase,
  migrate,
  HistoryStore,
  AgentConversationStore,
}));
const BookmarkTreeStore = vi.hoisted(() => ({ reindexFoldsIfStale: vi.fn(() => 0) }));
vi.mock('@tepegoz/bookmarks', () => ({ BookmarkTreeStore }));

type Mod = typeof import('./database.electron');
async function load(): Promise<Mod> {
  vi.resetModules();
  return import('./database.electron');
}

const DB_PATH = join('/userData', 'tepegoz.db');
const tick = () => new Promise((r) => setImmediate(r));

let mod: Mod;
beforeEach(async () => {
  vi.clearAllMocks();
  openDatabase.mockImplementation(() => ({ close: vi.fn() }));
  fs.renameSync.mockImplementation(() => undefined);
  HistoryStore.reindexFoldsIfStale.mockReturnValue(0);
  HistoryStore.prune.mockReturnValue(0);
  BookmarkTreeStore.reindexFoldsIfStale.mockReturnValue(0);
  AgentConversationStore.reindexFoldsIfStale.mockReturnValue(0);
  mod = await load();
});

describe('openWithRepair', () => {
  it('returns the opened + migrated database', () => {
    const d = mod.openWithRepair(DB_PATH);
    expect(openDatabase).toHaveBeenCalledWith(DB_PATH);
    expect(migrate).toHaveBeenCalledWith(d);
  });

  it('quarantines the file and starts fresh when the first open/migrate fails', () => {
    openDatabase.mockImplementationOnce(() => {
      throw new Error('malformed');
    });
    const d = mod.openWithRepair(DB_PATH);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('quarantining'),
      expect.anything(),
    );
    // main + two sidecars renamed aside
    expect(fs.renameSync).toHaveBeenCalledTimes(3);
    expect(fs.renameSync).toHaveBeenCalledWith(DB_PATH, expect.stringContaining('.corrupt-'));
    expect(d).not.toBeNull();
    expect(mod.profileWasReset()).toMatch(/^tepegoz\.db\.corrupt-/);
  });

  it('returns null when the unreadable main file cannot be moved aside', () => {
    openDatabase.mockImplementationOnce(() => {
      throw new Error('malformed');
    });
    fs.renameSync.mockImplementation((from: string) => {
      if (from === DB_PATH) throw new Error('locked');
    });
    expect(mod.openWithRepair(DB_PATH)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not quarantine'));
  });

  it('returns null when even the fresh database fails to open', () => {
    openDatabase.mockImplementationOnce(() => {
      throw new Error('malformed');
    });
    openDatabase.mockImplementationOnce(() => {
      throw new Error('still broken');
    });
    expect(mod.openWithRepair(DB_PATH)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('fresh database also failed'),
      expect.anything(),
    );
  });
});

describe('initDatabase', () => {
  it('creates the Extensions dir, wires getDb, and defers the maintenance pass', async () => {
    mod.initDatabase();
    expect(fs.mkdirSync).toHaveBeenCalledWith(join('/userData', 'Extensions'), { recursive: true });
    expect(mod.getDb()).not.toBeNull();
    expect(logger.info).toHaveBeenCalledWith('Database ready', expect.anything());

    await tick();
    expect(HistoryStore.reindexFoldsIfStale).toHaveBeenCalled();
    expect(BookmarkTreeStore.reindexFoldsIfStale).toHaveBeenCalled();
    expect(AgentConversationStore.reindexFoldsIfStale).toHaveBeenCalled();
    expect(HistoryStore.prune).toHaveBeenCalled();
  });

  it('is idempotent', () => {
    mod.initDatabase();
    openDatabase.mockClear();
    mod.initDatabase();
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it('leaves getDb() null when the database is unavailable', () => {
    openDatabase.mockImplementation(() => {
      throw new Error('nope');
    });
    fs.renameSync.mockImplementation((from: string) => {
      if (from === DB_PATH) throw new Error('locked');
    });
    mod.initDatabase();
    expect(mod.getDb()).toBeNull();
  });

  it('logs each deferred maintenance step that actually did work', async () => {
    HistoryStore.reindexFoldsIfStale.mockReturnValue(3);
    BookmarkTreeStore.reindexFoldsIfStale.mockReturnValue(5);
    AgentConversationStore.reindexFoldsIfStale.mockReturnValue(7);
    HistoryStore.prune.mockReturnValue(9);

    mod.initDatabase();
    await tick();

    expect(logger.info).toHaveBeenCalledWith('Re-folded history search index', { rows: 3 });
    expect(logger.info).toHaveBeenCalledWith('Re-folded bookmark search index', { rows: 5 });
    expect(logger.info).toHaveBeenCalledWith('Re-folded agent conversation search index', {
      rows: 7,
    });
    expect(logger.info).toHaveBeenCalledWith('Pruned expired history entries', { pruned: 9 });
  });

  it('swallows and logs a failure in the deferred maintenance pass', async () => {
    HistoryStore.reindexFoldsIfStale.mockImplementation(() => {
      throw new Error('index locked');
    });

    mod.initDatabase();
    await tick();

    expect(logger.warn).toHaveBeenCalledWith(
      'Deferred history maintenance failed',
      expect.objectContaining({ err: expect.stringContaining('index locked') as string }),
    );
  });

  it('proceeds when the Extensions dir cannot be created', () => {
    fs.mkdirSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    mod.initDatabase();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to create Extensions directory',
      expect.anything(),
    );
    expect(mod.getDb()).not.toBeNull();
  });
});

describe('closeDatabase', () => {
  it('is a no-op when there is no database', () => {
    expect(() => mod.closeDatabase()).not.toThrow();
  });

  it('closes the connection and nulls getDb', () => {
    const close = vi.fn();
    openDatabase.mockImplementation(() => ({ close }));
    mod.initDatabase();
    mod.closeDatabase();
    expect(close).toHaveBeenCalled();
    expect(mod.getDb()).toBeNull();
  });

  it('swallows a close failure and still nulls the handle', async () => {
    const badClose = vi.fn(() => {
      throw new Error('busy');
    });
    openDatabase.mockImplementation(() => ({ close: badClose }));
    const fresh = await load();
    fresh.initDatabase();
    fresh.closeDatabase();
    expect(logger.warn).toHaveBeenCalledWith('Failed to close database cleanly', expect.anything());
    expect(fresh.getDb()).toBeNull();
  });
});
