import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `clearBrowsingData` — one action for the whole browsing-data set over a time range. Pinned: each DB
 * category attempted independently (a thrown one is REPORTED in `failed`, not swallowed); no DB means
 * every DB-backed wanted category is reported failed; the Chromium half runs over EVERY browsing
 * partition except `APP_PARTITION`, counts the partitions cleared, and reports the category failed
 * only when there were targets and none succeeded; and the Event Journal record carries counts +
 * category names, never the data, and a failed append is swallowed with a warning.
 */

const cutoff = vi.hoisted((): { value: number | null } => ({ value: 1000 }));
vi.mock('@tepegoz/shared-types', () => ({ browsingDataCutoff: () => cutoff.value }));

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const stores = vi.hoisted(() => ({
  HistoryStore: {
    deleteSince: vi.fn(() => 5),
    count: vi.fn(() => 12),
    clear: vi.fn(),
  },
  DownloadStore: { clearTerminalSince: vi.fn(() => 3) },
  AgentConversationStore: { clearSince: vi.fn(() => 2) },
  EventJournal: { append: vi.fn() },
}));
vi.mock('@tepegoz/persistence', () => stores);

const APP_SESSION = { __app: true };
vi.mock('../window', () => ({ APP_PARTITION: 'persist:app' }));
vi.mock('electron', () => ({ session: { fromPartition: () => APP_SESSION } }));

const sessions = vi.hoisted(
  (): {
    list: {
      partition: string;
      session: { clearStorageData: () => Promise<void>; clearCache: () => Promise<void> };
    }[];
  } => ({ list: [] }),
);
vi.mock('../network/browsing-sessions.electron', () => ({ default: { all: () => sessions.list } }));

const { clearBrowsingData } = await import('./clear-browsing-data.electron');

const DB = { __db: true } as never;
const req = (categories: string[], range = 'lastHour') => ({ range, categories }) as never;
const partition = (ok = true) => ({
  partition: 'persist:p',
  session: {
    clearStorageData: ok
      ? vi.fn(() => Promise.resolve())
      : vi.fn(() => Promise.reject(new Error('no'))),
    clearCache: ok ? vi.fn(() => Promise.resolve()) : vi.fn(() => Promise.reject(new Error('no'))),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  cutoff.value = 1000;
  sessions.list = [];
  stores.HistoryStore.deleteSince.mockReturnValue(5);
  stores.HistoryStore.count.mockReturnValue(12);
  stores.DownloadStore.clearTerminalSince.mockReturnValue(3);
  stores.AgentConversationStore.clearSince.mockReturnValue(2);
});

describe('the database half', () => {
  it('clears history since the cutoff, downloads and agent history, and counts each', async () => {
    const r = await clearBrowsingData(DB, req(['history', 'downloads', 'agentHistory']));
    expect(stores.HistoryStore.deleteSince).toHaveBeenCalledWith(DB, 1000);
    expect(stores.DownloadStore.clearTerminalSince).toHaveBeenCalledWith(DB, 1000);
    expect(stores.AgentConversationStore.clearSince).toHaveBeenCalledWith(DB, 1000);
    expect(r).toMatchObject({
      historyEntries: 5,
      downloadEntries: 3,
      agentConversations: 2,
      failed: [],
    });
  });

  it('an "all time" range (null cutoff) counts then clears all history, and passes 0 downstream', async () => {
    cutoff.value = null;
    const r = await clearBrowsingData(DB, req(['history', 'downloads', 'agentHistory']));
    expect(stores.HistoryStore.count).toHaveBeenCalledWith(DB);
    expect(stores.HistoryStore.clear).toHaveBeenCalledWith(DB);
    expect(stores.DownloadStore.clearTerminalSince).toHaveBeenCalledWith(DB, 0);
    expect(r.historyEntries).toBe(12);
  });

  it('reports a category that throws instead of swallowing it', async () => {
    stores.DownloadStore.clearTerminalSince.mockImplementation(() => {
      throw new Error('locked');
    });
    const r = await clearBrowsingData(DB, req(['history', 'downloads']));
    expect(r.failed).toEqual(['downloads']);
    expect(r.historyEntries).toBe(5);
    expect(logger.warn).toHaveBeenCalledWith(
      'Clear browsing data: a category failed',
      expect.objectContaining({ category: 'downloads' }),
    );
  });

  it('reports history and agentHistory independently, still clearing downloads', async () => {
    stores.HistoryStore.deleteSince.mockImplementation(() => {
      throw new Error('history table locked');
    });
    stores.AgentConversationStore.clearSince.mockImplementation(() => {
      throw new Error('agent history locked');
    });
    const r = await clearBrowsingData(DB, req(['history', 'downloads', 'agentHistory']));
    expect(r.failed).toEqual(['history', 'agentHistory']);
    expect(r.downloadEntries).toBe(3);
    expect(logger.warn).toHaveBeenCalledWith(
      'Clear browsing data: a category failed',
      expect.objectContaining({ category: 'history' }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Clear browsing data: a category failed',
      expect.objectContaining({ category: 'agentHistory' }),
    );
  });

  it('with no database, every wanted DB category is reported failed and no store is touched', async () => {
    const r = await clearBrowsingData(
      null,
      req(['history', 'downloads', 'agentHistory', 'cookies']),
    );
    expect(r.failed).toEqual(['history', 'downloads', 'agentHistory']);
    expect(stores.HistoryStore.deleteSince).not.toHaveBeenCalled();
  });
});

describe('the Chromium half', () => {
  it('clears cookies + cache on every browsing partition except APP_PARTITION', async () => {
    const p1 = partition();
    const p2 = partition();
    sessions.list = [p1, p2, { partition: 'app', session: APP_SESSION as never }];
    const r = await clearBrowsingData(DB, req(['cookies', 'cache']));
    expect(p1.session.clearStorageData).toHaveBeenCalledWith({
      storages: [
        'cookies',
        'localstorage',
        'indexdb',
        'cachestorage',
        'serviceworkers',
        'shadercache',
        'filesystem',
      ],
    });
    expect(p2.session.clearCache).toHaveBeenCalled();
    expect(r).toMatchObject({ cookiePartitions: 2, cachePartitions: 2, failed: [] });
  });

  it('reports cookies/cache failed only when there were targets and none cleared', async () => {
    sessions.list = [partition(false)];
    const r = await clearBrowsingData(DB, req(['cookies', 'cache']));
    expect(r.failed).toEqual(['cookies', 'cache']);
    expect(r.cookiePartitions).toBe(0);
  });

  it('does not report cookies failed when there are simply no browsing partitions', async () => {
    sessions.list = [];
    const r = await clearBrowsingData(DB, req(['cookies']));
    expect(r.failed).toEqual([]);
  });
});

describe('the Event Journal record', () => {
  it('appends BrowsingDataCleared with counts + category names only', async () => {
    await clearBrowsingData(DB, req(['history']));
    expect(stores.EventJournal.append).toHaveBeenCalledWith(
      DB,
      expect.objectContaining({
        type: 'BrowsingDataCleared',
        actor: 'user',
        redacted: false,
        payload: expect.objectContaining({
          range: 'lastHour',
          categories: ['history'],
          historyEntries: 5,
          failed: [],
        }) as object,
      }),
    );
  });

  it('is skipped entirely when there is no database', async () => {
    await clearBrowsingData(null, req(['cookies']));
    expect(stores.EventJournal.append).not.toHaveBeenCalled();
  });

  it('swallows a journal append failure with a warning', async () => {
    stores.EventJournal.append.mockImplementation(() => {
      throw new Error('disk');
    });
    await expect(clearBrowsingData(DB, req(['history']))).resolves.toBeDefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Clear browsing data journal append failed',
      expect.objectContaining({ err: expect.stringContaining('disk') as string }),
    );
  });
});
