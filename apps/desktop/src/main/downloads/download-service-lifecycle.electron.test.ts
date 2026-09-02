import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DownloadTrustVerdict } from '@tepegoz/downloads';

/**
 * `finishToQuarantine` and `ingestGeneratedFile` are the security promise of the download path made
 * concrete: whatever produced the bytes — a `will-download` transfer or a page the agent printed to
 * PDF — the file is hashed, handed to the injected `DownloadTrustProvider`, and left at `quarantined`
 * (or `blocked`) with a redacted audit record. Nothing here decides it is safe; only a human release
 * does. These paths had no behavioural test.
 */

const records = new Map<string, Record<string, unknown>>();

const store = vi.hoisted(() => ({
  upsert: vi.fn((_state: unknown, rec: { id: string }) => {
    recordsRef.set(rec.id, { ...(rec as Record<string, unknown>) });
  }),
  patch: vi.fn((_state: unknown, id: string, p: Record<string, unknown>) => {
    const cur = recordsRef.get(id);
    if (cur !== undefined) recordsRef.set(id, { ...cur, ...p });
  }),
  appendAudit: vi.fn(),
  applyRetentionPolicy: vi.fn(() => 0),
  downloadDirectory: vi.fn(() => '/dl'),
  takePending: vi.fn(() => undefined),
}));
// `vi.hoisted` runs before module-level `const records`, so the factory can't close over it directly.
const recordsRef = records;

const fs = vi.hoisted(() => ({
  cleanFilename: (s: string) => s,
  originOf: (u: string) => {
    try {
      return new URL(u).origin;
    } catch {
      return undefined;
    }
  },
  uniquePath: (dir: string, name: string) => `${dir}/${name}`,
  sha256File: vi.fn(() => Promise.resolve('a'.repeat(64))),
  moveFile: vi.fn(() => Promise.resolve()),
  hasCode: () => false,
}));

const autoretry = vi.hoisted(() => ({
  forget: vi.fn(),
  scheduleAutoRetry: vi.fn(() => false),
}));

vi.mock('./download-service-store.electron', () => store);
vi.mock('./download-service-fs.electron', () => fs);
vi.mock('./download-service-autoretry.electron', () => autoretry);
vi.mock('../network/browsing-sessions.electron', () => ({ default: { all: () => [] } }));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }));
vi.mock('node:fs/promises', () => ({ writeFile: vi.fn(() => Promise.resolve()) }));
vi.mock('electron', () => ({ app: { getPath: () => '/ud' } }));

const { finishToQuarantine, ingestGeneratedFile } = await import(
  './download-service-lifecycle.electron'
);

/** A `DownloadState` whose `records` map is the same one the store mock writes to. */
function stateWith(verdict: DownloadTrustVerdict | (() => Promise<never>)) {
  return {
    records,
    pendingByUrl: new Map(),
    rates: new Map(),
    trustProvider: {
      check: vi.fn(() =>
        typeof verdict === 'function' ? verdict() : Promise.resolve(verdict),
      ),
    },
  } as unknown as Parameters<typeof finishToQuarantine>[0];
}

function seedQuarantined(id: string, over: Record<string, unknown> = {}): void {
  records.set(id, {
    id,
    url: 'https://files.example/setup.bin',
    filename: 'setup.bin',
    mimeType: 'application/octet-stream',
    status: 'in_progress',
    risk: 'normal',
    trustVerdict: 'unknown',
    receivedBytes: 10,
    totalBytes: 10,
    quarantinePath: `/ud/Downloads/quarantine/${id}-setup.bin`,
    provenance: { actor: 'site', sourceOrigin: 'https://files.example' },
    ...over,
  });
}

beforeEach(() => {
  records.clear();
  vi.clearAllMocks();
});

describe('finishToQuarantine', () => {
  it('hashes the file and settles an unknown verdict at quarantined', async () => {
    seedQuarantined('d1');
    const state = stateWith('unknown');
    await finishToQuarantine(state, 'd1');

    const rec = records.get('d1')!;
    expect(rec.status).toBe('quarantined');
    expect(rec.trustVerdict).toBe('unknown');
    expect(rec.sha256).toBe('a'.repeat(64));
    expect(rec.completedAt).toEqual(expect.any(Number));
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadQuarantined', expect.any(Object));
  });

  it('settles a blocked verdict at blocked, with the DownloadBlocked audit', async () => {
    seedQuarantined('d2');
    await finishToQuarantine(stateWith('blocked'), 'd2');

    expect(records.get('d2')!.status).toBe('blocked');
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadBlocked', expect.any(Object));
    expect(store.appendAudit).not.toHaveBeenCalledWith('DownloadQuarantined', expect.any(Object));
  });

  it('does NOT auto-complete a safe verdict — release stays a separate human step', async () => {
    seedQuarantined('d3');
    await finishToQuarantine(stateWith('safe'), 'd3');

    const rec = records.get('d3')!;
    expect(rec.trustVerdict).toBe('safe');
    // Safe means "Safe Browsing had nothing on it", not "moved to Downloads".
    expect(rec.status).toBe('quarantined');
  });

  it('passes the hash, name, mime and origin to the trust provider', async () => {
    seedQuarantined('d4', {
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      provenance: { actor: 'site', sourceOrigin: 'https://bank.example' },
    });
    const state = stateWith('unknown');
    await finishToQuarantine(state, 'd4');

    expect((state.trustProvider as { check: ReturnType<typeof vi.fn> }).check).toHaveBeenCalledWith({
      sha256: 'a'.repeat(64),
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      sourceOrigin: 'https://bank.example',
    });
  });

  it('marks the record failed when hashing throws, and journals DownloadFailed', async () => {
    seedQuarantined('d5');
    fs.sha256File.mockRejectedValueOnce(new Error('EIO: read failed'));
    await finishToQuarantine(stateWith('unknown'), 'd5');

    const rec = records.get('d5')!;
    expect(rec.status).toBe('failed');
    expect(String(rec.error)).toContain('EIO');
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadFailed', expect.any(Object));
  });

  it('is a no-op for an id that is not in state', async () => {
    await expect(finishToQuarantine(stateWith('unknown'), 'missing')).resolves.toBeUndefined();
    expect(store.appendAudit).not.toHaveBeenCalled();
  });
});

describe('ingestGeneratedFile', () => {
  it('quarantines browser-generated bytes through the same path and returns an id, not a path', async () => {
    const state = stateWith('unknown');
    const id = await ingestGeneratedFile(state, {
      filename: 'My Report.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
      provenance: { actor: 'agent', sourceOrigin: 'https://app.example' },
      sourceUrl: 'https://app.example/report',
    });

    expect(typeof id).toBe('string');
    expect(id).not.toContain('/');
    const rec = records.get(id)!;
    expect(rec.status).toBe('quarantined');
    expect(rec.trustVerdict).toBe('unknown');
    expect(rec.provenance).toMatchObject({ actor: 'agent' });
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadStarted', expect.any(Object));
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadQuarantined', expect.any(Object));
  });

  it('classifies risk from the (page-controlled) filename rather than trusting the mime', async () => {
    const id = await ingestGeneratedFile(stateWith('unknown'), {
      // A hostile page titled its document to land an executable name in the save dialog.
      filename: 'report.exe',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([0]),
      provenance: { actor: 'agent' },
      sourceUrl: 'https://evil.example/x',
    });
    expect(records.get(id)!.risk).toBe('executable');
  });
});
