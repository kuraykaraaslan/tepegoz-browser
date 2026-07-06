import { describe, expect, it } from 'vitest';
import {
  clipboardOperationNeedsApproval,
  createClipboardAuditMetadata,
  redactClipboardPreview,
} from './index';
import { ClipboardWriteTextInputSchema } from './schemas';

describe('@tepegoz/clipboard', () => {
  it('requires approval for agent/site clipboard access', () => {
    expect(clipboardOperationNeedsApproval('copy', 'user')).toBe(false);
    expect(clipboardOperationNeedsApproval('read-text', 'user')).toBe(true);
    expect(clipboardOperationNeedsApproval('write-text', 'agent')).toBe(true);
  });

  it('builds audit metadata without storing content', () => {
    const meta = createClipboardAuditMetadata({
      operation: 'write-text',
      actor: 'agent',
      contentKind: 'text',
      contentLength: 12,
      ts: 7,
    });

    expect(meta).toEqual({
      operation: 'write-text',
      actor: 'agent',
      contentKind: 'text',
      contentLength: 12,
      ts: 7,
    });
  });

  it('redacts previews for HITL display', () => {
    expect(redactClipboardPreview('token: sk_abcdefghijklmnopqrstuvwxyz')).toContain('[secret]');
  });

  it('validates write-text input', () => {
    expect(ClipboardWriteTextInputSchema.safeParse({ text: 'hello' }).success).toBe(true);
    expect(ClipboardWriteTextInputSchema.safeParse({ text: 1 }).success).toBe(false);
  });
});
