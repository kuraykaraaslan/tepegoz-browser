import { describe, expect, it } from 'vitest';
import {
  classifyDownloadRisk,
  commandNeedsApproval,
  computeDownloadRate,
  emptyDownloadsState,
  isRetryableStatus,
  patchDownload,
  releaseNeedsApproval,
  upsertDownload,
  type DownloadRecord,
} from './index';
import { DownloadCommandInputSchema } from './schemas';

function record(overrides: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'd1',
    url: 'https://example.com/file.txt',
    filename: 'file.txt',
    status: 'quarantined',
    risk: 'normal',
    trustVerdict: 'unknown',
    receivedBytes: 10,
    totalBytes: 10,
    canResume: false,
    createdAt: 1,
    updatedAt: 1,
    provenance: { actor: 'user' },
    ...overrides,
  };
}

describe('@tepegoz/downloads', () => {
  it('upserts and patches records without mutating state', () => {
    const state = upsertDownload(emptyDownloadsState(), record());
    const next = patchDownload(state, { id: 'd1', patch: { status: 'completed' } });

    expect(state.items[0]?.status).toBe('quarantined');
    expect(next.items[0]?.status).toBe('completed');
  });

  it('classifies executable and archive risks by filename', () => {
    expect(classifyDownloadRisk('setup.exe')).toBe('executable');
    expect(classifyDownloadRisk('bundle.zip')).toBe('archive');
    expect(classifyDownloadRisk('notes.txt')).toBe('normal');
  });

  it('requires approval for risky or agent releases', () => {
    expect(releaseNeedsApproval(record())).toBe(false);
    expect(releaseNeedsApproval(record({ risk: 'script', filename: 'run.sh' }))).toBe(true);
    expect(releaseNeedsApproval(record({ provenance: { actor: 'agent' } }))).toBe(true);
    expect(commandNeedsApproval(record({ trustVerdict: 'unknown' }), 'open')).toBe(true);
  });

  it('validates command input at IPC/tool boundaries', () => {
    expect(DownloadCommandInputSchema.safeParse({ id: 'd1', action: 'pause' }).success).toBe(true);
    expect(DownloadCommandInputSchema.safeParse({ id: 'd1', action: 'retry' }).success).toBe(true);
    expect(DownloadCommandInputSchema.safeParse({ id: 'd1', action: 'delete' }).success).toBe(
      false,
    );
  });

  it('marks only stopped downloads retryable, and retry needs no extra approval', () => {
    expect(isRetryableStatus('failed')).toBe(true);
    expect(isRetryableStatus('canceled')).toBe(true);
    expect(isRetryableStatus('in_progress')).toBe(false);
    expect(isRetryableStatus('quarantined')).toBe(false);
    // The retry re-enters the quarantine/trust path itself, so the command is not separately gated.
    expect(commandNeedsApproval(record({ status: 'failed', risk: 'executable' }), 'retry')).toBe(
      false,
    );
  });

  describe('computeDownloadRate', () => {
    it('needs at least two samples', () => {
      expect(computeDownloadRate([{ at: 0, receivedBytes: 0 }], 1000)).toBeNull();
    });

    it('derives bytes/sec and ETA from the window span', () => {
      const rate = computeDownloadRate(
        [
          { at: 1_000, receivedBytes: 1_000 },
          { at: 3_000, receivedBytes: 5_000 },
        ],
        13_000,
      );
      // 4000 bytes over 2s = 2000 B/s; 8000 bytes left ⇒ 4s.
      expect(rate).toEqual({ bytesPerSecond: 2_000, etaSeconds: 4 });
    });

    it('reports a null ETA when the total is unknown', () => {
      const rate = computeDownloadRate(
        [
          { at: 0, receivedBytes: 0 },
          { at: 1_000, receivedBytes: 500 },
        ],
        null,
      );
      expect(rate?.bytesPerSecond).toBe(500);
      expect(rate?.etaSeconds).toBeNull();
    });

    it('rejects a non-positive span or a rewound byte count', () => {
      expect(
        computeDownloadRate(
          [
            { at: 2_000, receivedBytes: 100 },
            { at: 2_000, receivedBytes: 200 },
          ],
          null,
        ),
      ).toBeNull();
      expect(
        computeDownloadRate(
          [
            { at: 0, receivedBytes: 500 },
            { at: 1_000, receivedBytes: 200 },
          ],
          null,
        ),
      ).toBeNull();
    });
  });
});
