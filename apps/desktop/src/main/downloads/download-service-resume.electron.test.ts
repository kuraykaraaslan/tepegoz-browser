import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Resuming a transfer whose live `DownloadItem` is gone (app restarted, or the session was torn
 * down). The safety rules live in the pure `planDownloadResume` (`@tepegoz/downloads`, used as-is
 * here); this file covers the wiring — the bytes on disk are MEASURED, a disagreement restarts rather
 * than blindly appends, and a tunnel-bound transfer resumes on its own partition, never on Direct.
 */

const fsMock = vi.hoisted(() => ({ statSync: vi.fn(() => ({ size: 500 })) }));
const store = vi.hoisted(() => ({ patch: vi.fn() }));
const sessions = vi.hoisted(() => {
  const createInterruptedDownload = vi.fn();
  return {
    createInterruptedDownload,
    ensure: vi.fn(() => ({ createInterruptedDownload })),
  };
});

vi.mock('node:fs', () => fsMock);
vi.mock('./download-service-store.electron', () => store);
vi.mock('../network/browsing-sessions.electron', () => ({ default: { ensure: sessions.ensure } }));
vi.mock('@tepegoz/tab-engine', () => ({ DIRECT_PARTITION: 'persist:tepegoz-web' }));
vi.mock('@tepegoz/libs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tepegoz/libs')>()),
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { resumeInterrupted, resumeRefusal } = await import('./download-service-resume.electron');

const state = { records: new Map() } as unknown as Parameters<typeof resumeInterrupted>[0];

function record(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    url: 'https://files.example/big.bin',
    filename: 'big.bin',
    status: 'paused',
    receivedBytes: 500,
    totalBytes: 1000,
    canResume: true,
    etag: '"v1"',
    quarantinePath: '/ud/quarantine/d1-big.bin',
    urlChain: ['https://files.example/big.bin'],
    createdAt: 1_000_000,
    ...over,
  } as unknown as Parameters<typeof resumeInterrupted>[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  fsMock.statSync.mockReturnValue({ size: 500 });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('resumeInterrupted', () => {
  it('resumes when the file on disk matches the record, driving createInterruptedDownload', () => {
    const plan = resumeInterrupted(state, record());
    expect(plan.action).toBe('resume');
    expect(sessions.createInterruptedDownload).toHaveBeenCalledTimes(1);
    const arg = sessions.createInterruptedDownload.mock.calls[0]![0] as {
      path: string;
      offset: number;
      urlChain: string[];
      eTag?: string;
    };
    expect(arg.path).toBe('/ud/quarantine/d1-big.bin');
    expect(arg.offset).toBe(500);
    expect(arg.eTag).toBe('"v1"');
    expect(store.patch).toHaveBeenCalledWith(state, 'd1', { status: 'in_progress' });
  });

  it('restarts (moves nothing) when the bytes on disk disagree with the record', () => {
    fsMock.statSync.mockReturnValue({ size: 123 }); // a truncated / half-written file
    const plan = resumeInterrupted(state, record());
    expect(plan).toMatchObject({ action: 'restart', reason: 'byte-count-disagrees' });
    expect(sessions.createInterruptedDownload).not.toHaveBeenCalled();
    expect(store.patch).not.toHaveBeenCalled();
  });

  it('treats an unreadable partial file as "no partial file", not a zero-length one', () => {
    fsMock.statSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(resumeInterrupted(state, record()).reason).toBe('no-partial-file');
    expect(sessions.createInterruptedDownload).not.toHaveBeenCalled();
  });

  it('restarts when the server offered no validator to check the bytes against', () => {
    const plan = resumeInterrupted(state, record({ etag: undefined, lastModified: undefined }));
    expect(plan).toMatchObject({ action: 'restart', reason: 'no-validator' });
  });

  it('resumes a tunnel-bound transfer on its own partition, never on Direct', () => {
    resumeInterrupted(state, record({ partition: 'persist:tunnel-7f3a' }));
    expect(sessions.ensure).toHaveBeenCalledWith('persist:tunnel-7f3a');
  });

  it('falls back to Direct when the record carries no partition', () => {
    resumeInterrupted(state, record());
    expect(sessions.ensure).toHaveBeenCalledWith('persist:tepegoz-web');
  });

  it('uses the recorded URL chain, falling back to the bare URL when it is empty', () => {
    resumeInterrupted(state, record({ urlChain: [] }));
    const arg = sessions.createInterruptedDownload.mock.calls[0]![0] as { urlChain: string[] };
    expect(arg.urlChain).toEqual(['https://files.example/big.bin']);
  });
});

describe('resumeRefusal', () => {
  it('maps already-complete to a distinct 409', () => {
    const err = resumeRefusal({ action: 'restart', offset: 0, reason: 'already-complete' });
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('downloadAlreadyComplete');
  });

  it('maps every other refusal reason to "must restart"', () => {
    const err = resumeRefusal({ action: 'restart', offset: 0, reason: 'byte-count-disagrees' });
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('downloadMustRestart');
  });
});
