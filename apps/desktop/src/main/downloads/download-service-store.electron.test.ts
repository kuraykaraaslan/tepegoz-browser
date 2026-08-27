import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadProvenance, DownloadStatus } from '@tepegoz/downloads';

/**
 * The desktop DownloadService's shared-state helpers. `getDb` returns null (no persistence side
 * effects) and there are no windows (no broadcast), so this exercises the in-memory logic only:
 * the FIFO provenance queue that matches a `will-download` back to who asked for it, the
 * newest-first projection, and the live rate join added for the speed/ETA row.
 */

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/dl' },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn() } }));
vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => ({ downloadDirectory: '' }) },
}));
vi.mock('@tepegoz/persistence', () => ({
  DownloadStore: { upsert: vi.fn(), remove: vi.fn(), clearTerminal: vi.fn(), list: () => [] },
  EventJournal: { append: vi.fn() },
}));
vi.mock('../db/database.electron', () => ({ getDb: () => null }));

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
});
