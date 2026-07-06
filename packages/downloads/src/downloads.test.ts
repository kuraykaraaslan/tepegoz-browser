import { describe, expect, it } from 'vitest';
import {
  classifyDownloadRisk,
  commandNeedsApproval,
  emptyDownloadsState,
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
    expect(DownloadCommandInputSchema.safeParse({ id: 'd1', action: 'delete' }).success).toBe(false);
  });
});
