import { createHash, randomUUID } from 'node:crypto';
import { clipboard, type WebContents } from 'electron';
import {
  createClipboardAuditMetadata,
  type ClipboardActor,
  type ClipboardAuditMetadata,
  type ClipboardOperation,
  type ClipboardReadTextInput,
  type ClipboardWriteTextInput,
} from '@tepegoz/clipboard';
import { EventJournal } from '@tepegoz/persistence';
import { Logger } from '@tepegoz/libs';
import { getDb } from '../db/database.electron';

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function audit(meta: ClipboardAuditMetadata): void {
  const db = getDb();
  if (db === null) return;
  try {
    EventJournal.append(db, {
      id: randomUUID(),
      type: 'ClipboardAccessed',
      ts: meta.ts,
      actor: meta.actor,
      correlationId: `clipboard-${String(meta.ts)}`,
      redacted: true,
      payload: meta,
    });
  } catch (err) {
    Logger.warn('Clipboard audit append failed', { err: String(err) });
  }
}

function auditWebContents(
  wc: WebContents | undefined,
  operation: ClipboardOperation,
  actor: ClipboardActor = 'user',
): void {
  audit(
    createClipboardAuditMetadata({
      operation,
      actor,
      origin: wc !== undefined && !wc.isDestroyed() ? originOf(wc.getURL()) : undefined,
      contentKind: operation === 'copy-image' ? 'image' : 'mixed',
    }),
  );
}

export default class ClipboardService {
  static copy(wc: WebContents | undefined): void {
    wc?.copy();
    auditWebContents(wc, 'copy');
  }

  static cut(wc: WebContents | undefined): void {
    wc?.cut();
    auditWebContents(wc, 'cut');
  }

  static paste(wc: WebContents | undefined): void {
    wc?.paste();
    auditWebContents(wc, 'paste');
  }

  static selectAll(wc: WebContents | undefined): void {
    wc?.selectAll();
    auditWebContents(wc, 'select-all');
  }

  static copyImageAt(wc: WebContents | undefined, x: number, y: number): void {
    wc?.copyImageAt(Math.round(x), Math.round(y));
    auditWebContents(wc, 'copy-image');
  }

  static writeText(input: ClipboardWriteTextInput): void {
    clipboard.writeText(input.text);
    audit(
      createClipboardAuditMetadata({
        operation: 'write-text',
        actor: input.actor ?? 'user',
        origin: input.origin,
        contentKind: input.text.length > 0 ? 'text' : 'empty',
        contentLength: input.text.length,
        contentSha256: sha256Text(input.text),
      }),
    );
  }

  static readText(input: ClipboardReadTextInput = {}): string {
    const text = clipboard.readText();
    audit(
      createClipboardAuditMetadata({
        operation: 'read-text',
        actor: input.actor ?? 'user',
        origin: input.origin,
        contentKind: text.length > 0 ? 'text' : 'empty',
        contentLength: text.length,
        contentSha256: text.length > 0 ? sha256Text(text) : undefined,
      }),
    );
    return text;
  }
}
