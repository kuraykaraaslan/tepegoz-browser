import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const QDIR = join('/userData', 'Downloads', 'quarantine');

/**
 * `download-service-lifecycle.electron` — the will-download / generated-file / quarantine pipeline.
 * Pinned: `handleWillDownload` redirects the item into the quarantine dir, records a started download,
 * and its `updated` / `done` listeners track rate + status (pause drops the rate window; completed →
 * quarantine; cancelled retires retries; a network drop only fails when no auto-retry is scheduled);
 * `ingestGeneratedFile` writes the bytes into the same quarantine path and runs the same
 * `finishToQuarantine`; and `finishToQuarantine` hashes + trust-checks the file, patching the row to
 * quarantined / blocked (or failed, logged, on error).
 */

vi.mock('node:crypto', () => ({ randomUUID: () => 'uuid-1' }));
const mkdirSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({ mkdirSync }));
const writeFile = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('node:fs/promises', () => ({ writeFile }));
vi.mock('electron', () => ({ app: { getPath: () => '/userData' } }));

vi.mock('@tepegoz/downloads', () => ({
  classifyDownloadRisk: () => 'normal',
  computeDownloadRate: () => ({ bytesPerSecond: 100, etaSeconds: 1 }),
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn() } }));

const retry = vi.hoisted(() => ({ forget: vi.fn(), scheduleAutoRetry: vi.fn(() => false) }));
vi.mock('./download-service-autoretry.electron', () => retry);
vi.mock('../network/browsing-sessions.electron', () => ({ default: { all: () => [] } }));
vi.mock('./download-service-fs.electron', () => ({
  cleanFilename: (n: string) => n,
  originOf: () => 'https://origin.test',
  sha256File: vi.fn(() => Promise.resolve('sha-abc')),
  uniquePath: (dir: string, name: string) => `${dir}/${name}`,
}));

const store = vi.hoisted(() => ({
  applyRetentionPolicy: vi.fn(),
  appendAudit: vi.fn(),
  downloadDirectory: () => '/userData/Downloads',
  patch: vi.fn(
    (
      s: { records: Map<string, Record<string, unknown>> },
      id: string,
      p: Record<string, unknown>,
    ) => {
      const r = s.records.get(id);
      if (r) Object.assign(r, p);
    },
  ),
  takePending: vi.fn((): unknown => undefined),
  upsert: vi.fn((s: { records: Map<string, Record<string, unknown>> }, rec: { id: string }) => {
    s.records.set(rec.id, rec);
  }),
}));
vi.mock('./download-service-store.electron', () => store);

const { handleWillDownload, ingestGeneratedFile, finishToQuarantine } =
  await import('./download-service-lifecycle.electron');

const fsMod = await import('./download-service-fs.electron');
const sha256File = fsMod.sha256File as ReturnType<typeof vi.fn>;

type State = {
  records: Map<string, Record<string, unknown>>;
  rates: Map<string, unknown>;
  trustProvider: { check: ReturnType<typeof vi.fn> };
};
const mkState = (): State => ({
  records: new Map(),
  rates: new Map(),
  trustProvider: { check: vi.fn(() => Promise.resolve('safe')) },
});
const cast = <T>(v: unknown): T => v as T;

const mkItem = (over: Record<string, unknown> = {}): Record<string, unknown> => {
  const listeners = new Map<string, (...a: unknown[]) => void>();
  return {
    getURL: () => 'https://dl.test/file.zip',
    getFilename: () => 'file.zip',
    getMimeType: () => 'application/zip',
    getTotalBytes: () => 1000,
    getReceivedBytes: () => 0,
    canResume: () => false,
    getURLChain: () => ['https://dl.test/file.zip'],
    getETag: () => '',
    getLastModifiedTime: () => '',
    setSavePath: vi.fn(),
    isPaused: () => false,
    on: vi.fn((ev: string, fn: (...a: unknown[]) => void) => listeners.set(ev, fn)),
    __listeners: listeners,
    ...over,
  };
};
const wc = { getURL: () => 'https://page.test/', session: {} };

let state: State;
beforeEach(() => {
  vi.clearAllMocks();
  state = mkState();
  sha256File.mockResolvedValue('sha-abc');
  retry.scheduleAutoRetry.mockReturnValue(false);
});

describe('handleWillDownload', () => {
  it('redirects the item to quarantine and records a started download', () => {
    const item = mkItem();
    handleWillDownload(cast(state), cast(item), cast(wc));
    expect(item.setSavePath).toHaveBeenCalledWith(`${QDIR}/uuid-1-file.zip`);
    expect(store.upsert).toHaveBeenCalled();
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadStarted', expect.anything());
    expect(
      (item.on as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]): unknown => c[0]),
    ).toEqual(['updated', 'done']);
  });

  it('captures the ETag and Last-Modified for a cross-restart resume when the item has them', () => {
    const item = mkItem({
      getETag: () => 'W/"abc123"',
      getLastModifiedTime: () => 'Wed, 03 Sep 2026 10:00:00 GMT',
    });
    handleWillDownload(cast(state), cast(item), cast(wc));
    expect(state.records.get('uuid-1')).toMatchObject({
      etag: 'W/"abc123"',
      lastModified: 'Wed, 03 Sep 2026 10:00:00 GMT',
    });
  });

  it('the updated listener drops the rate window on pause and patches status', () => {
    const item = mkItem();
    handleWillDownload(cast(state), cast(item), cast(wc));
    const updated = (item.__listeners as Map<string, (...a: unknown[]) => void>).get('updated')!;

    updated({}, 'interrupted');
    expect(state.rates.has('uuid-1')).toBe(false);
    expect(state.records.get('uuid-1')).toMatchObject({ status: 'paused' });

    updated({}, 'progressing');
    expect(state.records.get('uuid-1')).toMatchObject({ status: 'in_progress' });
    expect(state.rates.has('uuid-1')).toBe(true);
  });

  it('the done listener quarantines a completed transfer', () => {
    const item = mkItem();
    handleWillDownload(cast(state), cast(item), cast(wc));
    const done = (item.__listeners as Map<string, (...a: unknown[]) => void>).get('done')!;
    done({}, 'completed');
    // finishToQuarantine was invoked (fire-and-forget) — sha256File is its first await
    expect(sha256File).toHaveBeenCalled();
  });

  it('the done listener retires retries on cancel', () => {
    const item = mkItem();
    handleWillDownload(cast(state), cast(item), cast(wc));
    const done = (item.__listeners as Map<string, (...a: unknown[]) => void>).get('done')!;
    done({}, 'cancelled');
    expect(retry.forget).toHaveBeenCalledWith('uuid-1');
    expect(state.records.get('uuid-1')).toMatchObject({ status: 'canceled' });
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadCanceled', expect.anything());
  });

  it('a network drop fails only when no auto-retry is scheduled', () => {
    const itemA = mkItem();
    handleWillDownload(cast(state), cast(itemA), cast(wc));
    (itemA.__listeners as Map<string, (...a: unknown[]) => void>).get('done')!({}, 'interrupted');
    expect(state.records.get('uuid-1')).toMatchObject({ status: 'failed', error: 'interrupted' });

    retry.scheduleAutoRetry.mockReturnValue(true);
    store.appendAudit.mockClear();
    const state2 = mkState();
    const itemB = mkItem();
    handleWillDownload(cast(state2), cast(itemB), cast(wc));
    (itemB.__listeners as Map<string, (...a: unknown[]) => void>).get('done')!({}, 'interrupted');
    expect(store.appendAudit).not.toHaveBeenCalledWith('DownloadFailed', expect.anything());
  });
});

describe('ingestGeneratedFile', () => {
  it('writes the bytes to quarantine and runs the shared finish path', async () => {
    const id = await ingestGeneratedFile(cast(state), {
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
      provenance: { actor: 'agent', sourceUrl: 'https://x/', sourceOrigin: 'https://x' },
      sourceUrl: 'https://x/',
    });
    expect(id).toBe('uuid-1');
    expect(writeFile).toHaveBeenCalledWith(`${QDIR}/uuid-1-report.pdf`, new Uint8Array([1, 2, 3]));
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadStarted', expect.anything());
    expect(state.records.get('uuid-1')).toMatchObject({ status: 'quarantined', sha256: 'sha-abc' });
  });
});

describe('finishToQuarantine', () => {
  const seed = (over: Record<string, unknown> = {}): void => {
    state.records.set('d1', {
      id: 'd1',
      filename: 'f.bin',
      mimeType: 'application/octet-stream',
      quarantinePath: '/q/d1-f.bin',
      totalBytes: 500,
      receivedBytes: 500,
      provenance: { sourceOrigin: 'https://o' },
      ...over,
    });
  };

  it('hashes, trust-checks, and marks the row quarantined', async () => {
    seed();
    state.trustProvider.check.mockResolvedValue('safe');
    await finishToQuarantine(cast(state), 'd1');
    expect(state.records.get('d1')).toMatchObject({
      status: 'quarantined',
      trustVerdict: 'safe',
      sha256: 'sha-abc',
    });
    expect(retry.forget).toHaveBeenCalledWith('d1');
    expect(store.applyRetentionPolicy).toHaveBeenCalled();
  });

  it('marks the row blocked when the trust provider blocks it', async () => {
    seed();
    state.trustProvider.check.mockResolvedValue('blocked');
    await finishToQuarantine(cast(state), 'd1');
    expect(state.records.get('d1')).toMatchObject({ status: 'blocked' });
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadBlocked', expect.anything());
  });

  it('is a no-op for a missing record or one without a quarantine path', async () => {
    await finishToQuarantine(cast(state), 'nope');
    seed({ quarantinePath: undefined });
    await finishToQuarantine(cast(state), 'd1');
    expect(store.patch).not.toHaveBeenCalled();
  });

  it('fails and logs when hashing throws', async () => {
    seed();
    sha256File.mockRejectedValue(new Error('io error'));
    await finishToQuarantine(cast(state), 'd1');
    expect(state.records.get('d1')).toMatchObject({ status: 'failed', error: 'Error: io error' });
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadFailed', expect.anything());
  });
});
