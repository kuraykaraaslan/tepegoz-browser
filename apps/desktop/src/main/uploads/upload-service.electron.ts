import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { stat } from 'node:fs/promises';
import { BrowserWindow, type WebContents } from 'electron';
import {
  aggregateUploadRisk,
  classifyUploadRisk,
  type UploadCommandAction,
  type UploadCreateInput,
  type UploadFileRecord,
  type UploadProvenance,
  type UploadRecord,
  type UploadsState,
} from '@tepegoz/uploads';
import { AppError, Logger } from '@tepegoz/libs';
import { EventJournal } from '@tepegoz/persistence';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { getDb } from '../db/database.electron';
import FileOperationsHost from '../file-operations/file-operations-host';
import CdpDriver from '../agent/cdp-driver.electron';
import TabManager from '../tabs';
import BrowsingWebRequestService from '../web-request/browsing-web-request-service.electron';

interface ActiveUpload extends UploadRecord {
  paths: string[];
  requestIds: Set<number>;
}

const UPLOAD_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function mimeTypeFor(filename: string): string | undefined {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    csv: 'text/csv',
    gif: 'image/gif',
    html: 'text/html',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    json: 'application/json',
    md: 'text/markdown',
    pdf: 'application/pdf',
    png: 'image/png',
    txt: 'text/plain',
    webp: 'image/webp',
    zip: 'application/zip',
  };
  return map[ext];
}

function publicRecord(record: ActiveUpload): UploadRecord {
  return {
    id: record.id,
    ...(record.tabId !== undefined ? { tabId: record.tabId } : {}),
    ...(record.targetOrigin !== undefined ? { targetOrigin: record.targetOrigin } : {}),
    ...(record.targetUrl !== undefined ? { targetUrl: record.targetUrl } : {}),
    ...(record.ref !== undefined ? { ref: record.ref } : {}),
    ...(record.purpose !== undefined ? { purpose: record.purpose } : {}),
    status: record.status,
    risk: record.risk,
    files: record.files,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.completedAt !== undefined ? { completedAt: record.completedAt } : {}),
    ...(record.error !== undefined ? { error: record.error } : {}),
    provenance: record.provenance,
  };
}

async function fileRecord(path: string): Promise<UploadFileRecord> {
  const s = await stat(path);
  const filename = basename(path);
  const mimeType = mimeTypeFor(filename);
  const risk = classifyUploadRisk({ filename, mimeType, sizeBytes: s.size });
  return {
    filename,
    sizeBytes: s.size,
    ...(mimeType !== undefined ? { mimeType } : {}),
    risk,
  };
}

class UploadService {
  private static initialized = false;
  private static readonly records = new Map<string, ActiveUpload>();
  private static readonly pathToUploadId = new Map<string, string>();
  private static readonly requestToUploadId = new Map<number, string>();

  static init(): void {
    if (UploadService.initialized) return;
    UploadService.initialized = true;
    BrowsingWebRequestService.onBeforeRequest('uploads', (details) => {
      UploadService.observeBeforeRequest(details);
    });
    BrowsingWebRequestService.onCompleted('uploads', (details) => {
      UploadService.observeCompleted(details.id);
    });
    BrowsingWebRequestService.onErrorOccurred('uploads', (details) => {
      UploadService.observeFailed(details.id, details.error);
    });
  }

  static list(): UploadRecord[] {
    return [...UploadService.records.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(publicRecord);
  }

  static state(): UploadsState {
    return { items: UploadService.list() };
  }

  static async create(input: UploadCreateInput, wc?: WebContents | null): Promise<{ id: string }> {
    const target = wc ?? null;
    if (target === null || target.isDestroyed()) {
      throw new AppError('No active web page can receive this upload', 404);
    }
    const paths = await Promise.all(input.paths.map((p) => FileOperationsHost.assertReadableFile(p)));
    const files = await Promise.all(paths.map((p) => fileRecord(p)));
    const now = Date.now();
    const targetUrl = target.getURL();
    const provenance: UploadProvenance = {
      actor: input.actor ?? 'agent',
      sourceUrl: input.sourceUrl ?? targetUrl,
      sourceOrigin: input.sourceUrl !== undefined ? originOf(input.sourceUrl) : originOf(targetUrl),
      correlationId: input.correlationId,
      taskId: input.taskId,
    };
    const id = randomUUID();
    const record: ActiveUpload = {
      id,
      ...(input.tabId !== undefined ? { tabId: input.tabId } : {}),
      targetOrigin: originOf(targetUrl),
      targetUrl,
      ref: input.ref,
      ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      status: 'staged',
      risk: aggregateUploadRisk(files),
      files,
      createdAt: now,
      updatedAt: now,
      provenance,
      paths,
      requestIds: new Set<number>(),
    };
    UploadService.upsert(record);
    UploadService.appendAudit('UploadStaged', record);
    try {
      await CdpDriver.setFileInputFiles(target, input.ref, paths);
      for (const path of paths) UploadService.pathToUploadId.set(path, id);
      UploadService.patch(id, { status: 'bound', updatedAt: Date.now() });
      UploadService.appendAudit('UploadBound', UploadService.records.get(id));
      return { id };
    } catch (err) {
      UploadService.patch(id, { status: 'failed', error: String(err), updatedAt: Date.now() });
      UploadService.appendAudit('UploadFailed', UploadService.records.get(id));
      throw err;
    }
  }

  static async command(id: string, action: UploadCommandAction): Promise<void> {
    const record = UploadService.records.get(id);
    if (record === undefined) throw new AppError('Upload not found', 404);
    if (action === 'cancel') {
      await UploadService.cancel(record);
    } else if (action === 'clear') {
      UploadService.remove(id, 'UploadCleared');
    } else {
      throw new AppError('Unsupported upload command', 400);
    }
  }

  private static async cancel(record: ActiveUpload): Promise<void> {
    const wc =
      record.tabId !== undefined ? TabManager.webContentsForTab(record.tabId) : TabManager.activeWebContents();
    if (wc !== null && record.ref !== undefined && !wc.isDestroyed()) {
      await CdpDriver.setFileInputFiles(wc, record.ref, []).catch((err: unknown) => {
        Logger.warn('Failed to clear file input during upload cancel', { id: record.id, err: String(err) });
      });
    }
    UploadService.patch(record.id, { status: 'canceled', updatedAt: Date.now() });
    UploadService.dropPrivateIndexes(record);
    UploadService.appendAudit('UploadCanceled', UploadService.records.get(record.id));
  }

  private static observeBeforeRequest(details: Electron.OnBeforeRequestListenerDetails): void {
    if (!UPLOAD_METHODS.has(details.method.toUpperCase())) return;
    const files = (details.uploadData ?? [])
      .map((entry) => entry.file)
      .filter((path): path is string => typeof path === 'string' && path.length > 0);
    const uploadId = files.map((path) => UploadService.pathToUploadId.get(path)).find((id) => id !== undefined);
    if (uploadId === undefined) return;
    const record = UploadService.records.get(uploadId);
    if (record === undefined) return;
    record.requestIds.add(details.id);
    UploadService.requestToUploadId.set(details.id, uploadId);
    UploadService.patch(uploadId, {
      status: 'submitting',
      targetUrl: details.url,
      targetOrigin: originOf(details.url),
      updatedAt: Date.now(),
    });
    UploadService.appendAudit('UploadSubmitting', UploadService.records.get(uploadId));
  }

  private static observeCompleted(requestId: number): void {
    const uploadId = UploadService.requestToUploadId.get(requestId);
    if (uploadId === undefined) return;
    const record = UploadService.records.get(uploadId);
    if (record === undefined) return;
    UploadService.patch(uploadId, {
      status: 'completed',
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    UploadService.dropPrivateIndexes(record);
    UploadService.appendAudit('UploadCompleted', UploadService.records.get(uploadId));
  }

  private static observeFailed(requestId: number, error: string): void {
    const uploadId = UploadService.requestToUploadId.get(requestId);
    if (uploadId === undefined) return;
    const record = UploadService.records.get(uploadId);
    if (record === undefined) return;
    UploadService.patch(uploadId, { status: 'failed', error, updatedAt: Date.now() });
    UploadService.dropPrivateIndexes(record);
    UploadService.appendAudit('UploadFailed', UploadService.records.get(uploadId));
  }

  private static upsert(record: ActiveUpload): void {
    UploadService.records.set(record.id, record);
    UploadService.broadcast();
  }

  private static patch(id: string, patch: Partial<ActiveUpload>): void {
    const current = UploadService.records.get(id);
    if (current === undefined) return;
    UploadService.upsert({ ...current, ...patch, updatedAt: patch.updatedAt ?? Date.now() });
  }

  private static remove(id: string, auditType: Parameters<typeof EventJournal.append>[1]['type']): void {
    const record = UploadService.records.get(id);
    if (record !== undefined) {
      UploadService.dropPrivateIndexes(record);
      UploadService.appendAudit(auditType, record);
    }
    UploadService.records.delete(id);
    UploadService.broadcast();
  }

  private static dropPrivateIndexes(record: ActiveUpload): void {
    for (const path of record.paths) UploadService.pathToUploadId.delete(path);
    for (const requestId of record.requestIds) UploadService.requestToUploadId.delete(requestId);
  }

  private static broadcast(): void {
    const state = UploadService.state();
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IpcChannels.uploadsState, state);
    }
  }

  private static appendAudit(type: Parameters<typeof EventJournal.append>[1]['type'], record?: ActiveUpload): void {
    const db = getDb();
    if (db === null || record === undefined) return;
    try {
      EventJournal.append(db, {
        id: randomUUID(),
        type,
        ts: Date.now(),
        actor: record.provenance.actor,
        correlationId: record.provenance.correlationId ?? record.id,
        redacted: true,
        payload: {
          uploadId: record.id,
          status: record.status,
          risk: record.risk,
          targetOrigin: record.targetOrigin,
          sourceOrigin: record.provenance.sourceOrigin,
          taskId: record.provenance.taskId,
          files: record.files,
        },
      });
    } catch (err) {
      Logger.warn('Upload audit append failed', { id: record.id, err: String(err) });
    }
  }
}

export default UploadService;
