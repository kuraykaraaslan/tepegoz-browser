import { describe, expect, it } from 'vitest';
import { downloadsToForget, type DownloadRecord, type DownloadStatus } from './index';

/**
 * The download-list retention policy (Phase 2c, gap track §15).
 *
 * The rule this suite exists to protect: the FILES are never involved. Every case here is about rows
 * in a list, and the one thing a browser must not do is make "tidy up the list" quietly mean
 * "delete what I downloaded".
 */
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function record(id: string, status: DownloadStatus, updatedAt: number): DownloadRecord {
  return {
    id,
    url: `https://files.example/${id}`,
    filename: `${id}.pdf`,
    mimeType: 'application/pdf',
    status,
    risk: 'normal',
    trustVerdict: 'unknown',
    receivedBytes: 10,
    totalBytes: 10,
    canResume: false,
    createdAt: updatedAt,
    updatedAt,
    completedAt: null,
    error: null,
    sha256: null,
    provenance: { actor: 'user', sourceUrl: null, sourceOrigin: null, correlationId: null },
  } as unknown as DownloadRecord;
}

describe('downloadsToForget', () => {
  it('removes nothing under the default policy', () => {
    // `manual` is the default because a list that empties itself cannot answer "did I download that?",
    // which is most of what the list is for.
    const records = [
      record('a', 'completed', NOW - 30 * DAY),
      record('b', 'failed', NOW - 30 * DAY),
    ];
    expect(downloadsToForget(records, 'manual', NOW)).toEqual([]);
  });

  it('never touches a transfer that is still moving', () => {
    const records = [
      record('a', 'in_progress', NOW - 30 * DAY),
      record('b', 'paused', NOW - 30 * DAY),
      record('c', 'requested', NOW - 30 * DAY),
    ];
    expect(downloadsToForget(records, 'after-day', NOW)).toEqual([]);
    expect(downloadsToForget(records, 'on-completion', NOW)).toEqual([]);
  });

  it('never removes a QUARANTINED row, however old', () => {
    // No bytes are moving, so it looks terminal — but the file is still in quarantine waiting for a
    // release decision, and dropping the row strands it with no way to reach it from the UI.
    const records = [record('q', 'quarantined', NOW - 365 * DAY)];
    expect(downloadsToForget(records, 'after-day', NOW)).toEqual([]);
    expect(downloadsToForget(records, 'on-completion', NOW)).toEqual([]);
  });

  it('after-day keeps anything younger than a day and sweeps what is older', () => {
    const records = [
      record('fresh', 'completed', NOW - 23 * 60 * 60 * 1000),
      record('old', 'completed', NOW - DAY),
      record('older', 'failed', NOW - 3 * DAY),
    ];
    expect(downloadsToForget(records, 'after-day', NOW)).toEqual(['old', 'older']);
  });

  it('on-completion removes finished downloads but keeps the ones that went wrong', () => {
    // "As soon as they finish" means finished SUCCESSFULLY. A download that failed or was blocked is
    // exactly the row the user comes back to look for.
    const records = [
      record('done', 'completed', NOW),
      record('broke', 'failed', NOW),
      record('stopped', 'canceled', NOW),
      record('refused', 'blocked', NOW),
    ];
    expect(downloadsToForget(records, 'on-completion', NOW)).toEqual(['done']);
  });

  it('sweeps a day-old cancellation only under after-day', () => {
    const records = [record('stopped', 'canceled', NOW - 2 * DAY)];
    expect(downloadsToForget(records, 'after-day', NOW)).toEqual(['stopped']);
    expect(downloadsToForget(records, 'on-completion', NOW)).toEqual([]);
  });
});
