import { describe, expect, it } from 'vitest';
import {
  aggregateUploadRisk,
  classifyUploadRisk,
  emptyUploadsState,
  patchUpload,
  uploadNeedsApproval,
  upsertUpload,
  type UploadRecord,
} from './index';
import { UploadCommandInputSchema } from './schemas';

function record(overrides: Partial<UploadRecord> = {}): UploadRecord {
  return {
    id: 'u1',
    targetOrigin: 'https://example.com',
    ref: 1,
    status: 'bound',
    risk: 'normal',
    files: [{ filename: 'report.txt', sizeBytes: 42, mimeType: 'text/plain', risk: 'normal' }],
    createdAt: 1,
    updatedAt: 1,
    provenance: { actor: 'user' },
    ...overrides,
  };
}

describe('@tepegoz/uploads', () => {
  it('upserts and patches records without mutating state', () => {
    const state = upsertUpload(emptyUploadsState(), record());
    const next = patchUpload(state, { id: 'u1', patch: { status: 'completed' } });

    expect(state.items[0]?.status).toBe('bound');
    expect(next.items[0]?.status).toBe('completed');
  });

  it('classifies risky uploads by filename, mime and size', () => {
    expect(classifyUploadRisk({ filename: 'setup.exe' })).toBe('executable');
    expect(classifyUploadRisk({ filename: 'script.sh' })).toBe('script');
    expect(classifyUploadRisk({ filename: 'bundle.zip' })).toBe('archive');
    expect(classifyUploadRisk({ filename: 'movie.mov', sizeBytes: 30 * 1024 * 1024 })).toBe('large');
    expect(classifyUploadRisk({ filename: 'notes.txt' })).toBe('normal');
  });

  it('aggregates file risk and requires approval for agent or risky uploads', () => {
    expect(aggregateUploadRisk(record().files)).toBe('normal');
    expect(
      aggregateUploadRisk([
        { filename: 'a.txt', sizeBytes: 1, risk: 'normal' },
        { filename: 'run.ps1', sizeBytes: 1, risk: 'script' },
      ]),
    ).toBe('script');
    expect(uploadNeedsApproval(record())).toBe(false);
    expect(uploadNeedsApproval(record({ provenance: { actor: 'agent' } }))).toBe(true);
    expect(uploadNeedsApproval(record({ risk: 'archive' }))).toBe(true);
  });

  it('validates command input at IPC/tool boundaries', () => {
    expect(UploadCommandInputSchema.safeParse({ id: 'u1', action: 'cancel' }).success).toBe(true);
    expect(UploadCommandInputSchema.safeParse({ id: 'u1', action: 'pause' }).success).toBe(false);
  });
});
