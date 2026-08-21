export const CLIPBOARD_ACTORS = ['user', 'agent', 'site'] as const;
export type ClipboardActor = (typeof CLIPBOARD_ACTORS)[number];

export const CLIPBOARD_OPERATIONS = [
  'copy',
  'cut',
  'paste',
  'select-all',
  'copy-image',
  'read-text',
  'write-text',
] as const;
export type ClipboardOperation = (typeof CLIPBOARD_OPERATIONS)[number];

export const CLIPBOARD_CONTENT_KINDS = ['empty', 'text', 'html', 'image', 'mixed'] as const;
export type ClipboardContentKind = (typeof CLIPBOARD_CONTENT_KINDS)[number];

export const CLIPBOARD_PERMISSION_CAPABILITIES = ['clipboardRead', 'clipboardWrite'] as const;
export type ClipboardPermissionCapability = (typeof CLIPBOARD_PERMISSION_CAPABILITIES)[number];

export interface ClipboardOperationInput {
  operation: ClipboardOperation;
  actor?: ClipboardActor | undefined;
  origin?: string | undefined;
}

export interface ClipboardWriteTextInput {
  text: string;
  actor?: ClipboardActor | undefined;
  origin?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface ClipboardReadTextInput {
  actor?: ClipboardActor | undefined;
  origin?: string | undefined;
}

export interface ClipboardAuditMetadata {
  operation: ClipboardOperation;
  actor: ClipboardActor;
  origin?: string | undefined;
  contentKind: ClipboardContentKind;
  contentLength?: number | undefined;
  contentSha256?: string | undefined;
  ts: number;
}

export function clipboardOperationNeedsApproval(
  operation: ClipboardOperation,
  actor: ClipboardActor,
): boolean {
  if (actor !== 'user') return true;
  return operation === 'read-text' || operation === 'write-text';
}

export function redactClipboardPreview(text: string, maxChars = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const withoutSecrets = normalized
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/\b(?:sk|pk|ak|pat)_[A-Za-z0-9_-]{16,}\b/g, '[secret]')
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g, '[token]');
  return withoutSecrets.length <= maxChars
    ? withoutSecrets
    : `${withoutSecrets.slice(0, maxChars)}...`;
}

export function createClipboardAuditMetadata(input: {
  operation: ClipboardOperation;
  actor?: ClipboardActor | undefined;
  origin?: string | undefined;
  contentKind?: ClipboardContentKind | undefined;
  contentLength?: number | undefined;
  contentSha256?: string | undefined;
  ts?: number | undefined;
}): ClipboardAuditMetadata {
  return {
    operation: input.operation,
    actor: input.actor ?? 'user',
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
    contentKind: input.contentKind ?? 'empty',
    ...(input.contentLength !== undefined ? { contentLength: input.contentLength } : {}),
    ...(input.contentSha256 !== undefined ? { contentSha256: input.contentSha256 } : {}),
    ts: input.ts ?? Date.now(),
  };
}
