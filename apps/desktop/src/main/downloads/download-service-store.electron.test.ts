import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadProvenance, DownloadStatus } from '@tepegoz/downloads';

/**
 * The desktop DownloadService's shared-state helpers. `getDb` returns null (no persistence side
 * effects) and there are no windows (no broadcast), so this exercises the in-memory logic only:
 * the FIFO provenance queue that matches a `will-download` back to who asked for it, the
 * newest-first projection, and the live rate join added for the speed/ETA row.
 */

const bw = vi.hoisted(() => ({ windows: [] as unknown[] }));
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/dl' },
  BrowserWindow: { getAllWindows: () => bw.windows },
}));
vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }));
const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
const prefs = vi.hoisted(() => ({
  getAll: vi.fn<() => Record<string, unknown>>(() => ({
    downloadDirectory: '',
    downloadHistoryRetention: { mode: 'manual' },
  })),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));
const downloadStore = vi.hoisted(() => ({
  upsert: vi.fn(),
  remove: vi.fn(),
  clearTerminal: vi.fn(),
  list: () => [],
}));
const eventJournal = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock('@tepegoz/persistence', () => ({
  DownloadStore: downloadStore,
  EventJournal: eventJournal,
}));
const getDb = vi.hoisted(() => vi.fn<() => unknown>(() => null));
vi.mock('../db/database.electron', () => ({ getDb }));

const store = await import('./download-service-store.electron');

interface RecOver {
  id?: string;
  status?: DownloadStatus;
  updatedAt?: number;
  receivedBytes?: number;
  totalBytes?: number | null;
}
type ActiveRecord = Parameters<typeof store.upsert>[1];
function activeRecord(o: RecOver = {}): ActiveRecord {
  const provenance: DownloadProvenance = { actor: 'user' };
  return {
    id: o.id ?? 'd1',
    url: 'https://x/f.bin',
    filename: 'f.bin',
    status: o.status ?? 'in_progress',
    risk: 'normal',
    trustVerdict: 'unknown',
    receivedBytes: o.receivedBytes ?? 0,
    totalBytes: o.totalBytes ?? null,
    canResume: false,
    createdAt: 1,
    updatedAt: o.updatedAt ?? 1,
    provenance,
  };
}

let ctx: ReturnType<typeof store.createState>;
beforeEach(() => {
  vi.clearAllMocks();
  bw.windows = [];
  getDb.mockReturnValue(null);
  prefs.getAll.mockReturnValue({
    downloadDirectory: '',
    downloadHistoryRetention: { mode: 'manual' },
  });
  ctx = store.createState();
});

describe('pending provenance queue', () => {
  it('is FIFO per URL and cleans the key when drained', () => {
    const url = 'https://x/f.bin';
    store.pushPending(ctx, url, { actor: 'agent', taskId: 't1' });
    store.pushPending(ctx, url, { actor: 'user' });
    expect(store.takePending(ctx, url)?.taskId).toBe('t1');
    expect(store.takePending(ctx, url)?.actor).toBe('user');
    expect(store.takePending(ctx, url)).toBeUndefined();
    expect(ctx.pendingByUrl.has(url)).toBe(false);
  });

  it('returns undefined for a URL nothing asked for', () => {
    expect(store.takePending(ctx, 'https://nope/')).toBeUndefined();
  });
});

describe('list / snapshot', () => {
  it('orders newest-updated first', () => {
    store.upsert(ctx, activeRecord({ id: 'a', updatedAt: 10 }));
    store.upsert(ctx, activeRecord({ id: 'b', updatedAt: 30 }));
    store.upsert(ctx, activeRecord({ id: 'c', updatedAt: 20 }));
    expect(store.list(ctx).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(store.snapshot(ctx).items.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('attaches the live rate to an in_progress record only', () => {
    store.upsert(ctx, activeRecord({ id: 'a', status: 'in_progress', totalBytes: 1000 }));
    store.upsert(ctx, activeRecord({ id: 'b', status: 'completed' }));
    ctx.rates.set('a', { samples: [], current: { bytesPerSecond: 500, etaSeconds: 2 } });
    ctx.rates.set('b', { samples: [], current: { bytesPerSecond: 999, etaSeconds: 9 } });
    const byId = Object.fromEntries(store.list(ctx).map((r) => [r.id, r]));
    expect(byId.a?.bytesPerSecond).toBe(500);
    expect(byId.a?.etaSeconds).toBe(2);
    expect(byId.b?.bytesPerSecond).toBeUndefined();
  });
});

describe('patch / removeRecord / clearTerminal', () => {
  it('patch merges fields and bumps updatedAt, keeping id + createdAt', () => {
    store.upsert(ctx, activeRecord({ id: 'a', updatedAt: 1 }));
    store.patch(ctx, 'a', { status: 'paused', updatedAt: 5 });
    const rec = ctx.records.get('a');
    expect(rec?.status).toBe('paused');
    expect(rec?.createdAt).toBe(1);
  });

  it('removeRecord drops both the record and its rate window', () => {
    store.upsert(ctx, activeRecord({ id: 'a' }));
    ctx.rates.set('a', { samples: [], current: null });
    store.removeRecord(ctx, 'a');
    expect(ctx.records.has('a')).toBe(false);
    expect(ctx.rates.has('a')).toBe(false);
  });

  it('clearTerminal keeps active downloads and drops finished ones (+ their rate windows)', () => {
    store.upsert(ctx, activeRecord({ id: 'live', status: 'in_progress' }));
    store.upsert(ctx, activeRecord({ id: 'done', status: 'completed' }));
    ctx.rates.set('done', { samples: [], current: null });
    store.clearTerminal(ctx);
    expect([...ctx.records.keys()]).toEqual(['live']);
    expect(ctx.rates.has('done')).toBe(false);
  });
});

describe('downloadDirectory', () => {
  it('falls back to the OS downloads path when the pref is blank', () => {
    expect(store.downloadDirectory()).toBe('/tmp/dl');
  });

  it('uses a configured directory verbatim', () => {
    prefs.getAll.mockReturnValue({ downloadDirectory: '  /home/u/Downloads  ' });
    expect(store.downloadDirectory()).toBe('/home/u/Downloads');
  });
});

describe('persistence side effects (getDb non-null)', () => {
  it('upsert writes the projection through DownloadStore and swallows a write failure', () => {
    getDb.mockReturnValue({ __db: true });
    store.upsert(ctx, activeRecord({ id: 'a' }));
    expect(downloadStore.upsert).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ id: 'a' }),
    );

    downloadStore.upsert.mockImplementationOnce(() => {
      throw new Error('db locked');
    });
    expect(() => store.upsert(ctx, activeRecord({ id: 'b' }))).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to persist download projection',
      expect.objectContaining({ id: 'b' }),
    );
  });

  it('removeRecord and clearTerminal reach the store when a DB is present', () => {
    getDb.mockReturnValue({ __db: true });
    store.upsert(ctx, activeRecord({ id: 'a', status: 'completed' }));
    store.removeRecord(ctx, 'a');
    expect(downloadStore.remove).toHaveBeenCalledWith({ __db: true }, 'a');

    store.upsert(ctx, activeRecord({ id: 'x', status: 'completed' }));
    store.upsert(ctx, activeRecord({ id: 'y', status: 'in_progress' }));
    expect(store.clearTerminal(ctx)).toBe(1);
    expect(downloadStore.clearTerminal).toHaveBeenCalledWith({ __db: true });
  });
});

describe('broadcast', () => {
  it('pushes the newest-first snapshot to every live window on any mutation', () => {
    const send = vi.fn();
    bw.windows = [
      { isDestroyed: () => false, webContents: { send } },
      { isDestroyed: () => true, webContents: { send: vi.fn() } },
    ];
    store.upsert(ctx, activeRecord({ id: 'a', updatedAt: 5 }));
    expect(send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ items: expect.any(Array) as unknown[] }),
    );
  });
});

describe('applyRetentionPolicy', () => {
  it('is a no-op under the manual policy', () => {
    store.upsert(ctx, activeRecord({ id: 'old', status: 'completed', updatedAt: 1 }));
    expect(store.applyRetentionPolicy(ctx, 10_000_000)).toBe(0);
    expect(ctx.records.has('old')).toBe(true);
  });

  it('drops rows older than the age cutoff and reports the count', () => {
    prefs.getAll.mockReturnValue({
      downloadDirectory: '',
      downloadHistoryRetention: { mode: 'age', days: 1 },
    });
    const dayMs = 86_400_000;
    store.upsert(ctx, activeRecord({ id: 'stale', status: 'completed', updatedAt: 0 }));
    store.upsert(ctx, activeRecord({ id: 'fresh', status: 'completed', updatedAt: 5 * dayMs }));
    const removed = store.applyRetentionPolicy(ctx, 5 * dayMs);
    expect(removed).toBe(1);
    expect(ctx.records.has('stale')).toBe(false);
    expect(ctx.records.has('fresh')).toBe(true);
  });
});

describe('appendAudit', () => {
  it('journals a rich payload for the download when a DB is present', () => {
    getDb.mockReturnValue({ __db: true });
    const rec = activeRecord({
      id: 'd9',
      status: 'completed',
      receivedBytes: 100,
      totalBytes: 100,
    });
    store.appendAudit('DownloadCompleted' as never, rec);
    expect(eventJournal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({
        type: 'DownloadCompleted',
        actor: 'user',
        payload: expect.objectContaining({
          downloadId: 'd9',
          filename: 'f.bin',
          status: 'completed',
        }) as Record<string, unknown>,
      }),
    );
  });

  it('is a no-op with no DB or no record', () => {
    getDb.mockReturnValue(null);
    store.appendAudit('DownloadCompleted' as never, activeRecord());
    getDb.mockReturnValue({ __db: true });
    store.appendAudit('DownloadCompleted' as never, undefined);
    expect(eventJournal.append).not.toHaveBeenCalled();
  });

  it('swallows a journal-append failure with a warning', () => {
    getDb.mockReturnValue({ __db: true });
    eventJournal.append.mockImplementationOnce(() => {
      throw new Error('journal full');
    });
    expect(() => store.appendAudit('DownloadCompleted' as never, activeRecord())).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Download audit append failed',
      expect.objectContaining({ id: 'd1' }),
    );
  });
});
