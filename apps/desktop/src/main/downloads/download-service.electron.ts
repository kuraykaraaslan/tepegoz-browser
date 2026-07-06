import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  session,
  shell,
  type DownloadItem,
  type WebContents,
} from 'electron';
import {
  classifyDownloadRisk,
  type DownloadCommandAction,
  type DownloadCreateInput,
  type DownloadProvenance,
  type DownloadRecord,
  type DownloadTrustVerdict,
  type DownloadsState,
} from '@tepegoz/downloads';
import { AppError, Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import { DownloadStore, EventJournal, type PersistedDownload } from '@tepegoz/persistence';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { getDb } from '../db/database.electron';

interface ActiveDownload extends PersistedDownload {
  item?: DownloadItem | undefined;
}

export interface DownloadTrustProvider {
  check(input: {
    sha256: string;
    filename: string;
    mimeType?: string | undefined;
    sourceOrigin?: string | undefined;
  }): Promise<DownloadTrustVerdict>;
}

const unknownTrustProvider: DownloadTrustProvider = {
  check: () => Promise.resolve('unknown'),
};

const BROWSING_PARTITION = 'persist:tepegoz-web';
const RESERVED_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

function cleanFilename(filename: string): string {
  const cleaned = [...basename(filename)]
    .map((ch) => (RESERVED_FILENAME_CHARS.has(ch) || ch.charCodeAt(0) < 32 ? '_' : ch))
    .join('')
    .trim();
  return cleaned.length > 0 ? cleaned : 'download';
}

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (err) {
    if (!hasCode(err, 'EXDEV')) throw err;
    await copyFile(from, to);
    await unlink(from);
  }
}

function uniquePath(dir: string, filename: string): string {
  const safe = cleanFilename(filename);
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  let candidate = join(dir, safe);
  let i = 1;
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem} (${i})${ext}`);
    i += 1;
  }
  return candidate;
}

function publicRecord(record: ActiveDownload): DownloadRecord {
  return {
    id: record.id,
    url: record.url,
    filename: record.filename,
    ...(record.mimeType !== undefined ? { mimeType: record.mimeType } : {}),
    status: record.status,
    risk: record.risk,
    trustVerdict: record.trustVerdict,
    receivedBytes: record.receivedBytes,
    totalBytes: record.totalBytes,
    canResume: record.canResume,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.completedAt !== undefined ? { completedAt: record.completedAt } : {}),
    ...(record.error !== undefined ? { error: record.error } : {}),
    ...(record.sha256 !== undefined ? { sha256: record.sha256 } : {}),
    provenance: record.provenance,
  };
}

class DownloadService {
  private static initialized = false;
  private static trustProvider: DownloadTrustProvider = unknownTrustProvider;
  private static readonly records = new Map<string, ActiveDownload>();
  private static readonly pendingByUrl = new Map<string, DownloadProvenance[]>();

  static init(provider: DownloadTrustProvider = unknownTrustProvider): void {
    if (DownloadService.initialized) return;
    DownloadService.initialized = true;
    DownloadService.trustProvider = provider;
    const db = getDb();
    if (db !== null) {
      for (const record of DownloadStore.list(db)) {
        DownloadService.records.set(record.id, record);
      }
    }
    session.fromPartition(BROWSING_PARTITION).on('will-download', (_event, item, wc) => {
      DownloadService.handleWillDownload(item, wc);
    });
  }

  static list(): DownloadRecord[] {
    return [...DownloadService.records.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(publicRecord);
  }

  static state(): DownloadsState {
    return { items: DownloadService.list() };
  }

  static downloadURL(wc: WebContents, url: string, provenance?: Partial<DownloadProvenance>): void {
    if (url.length === 0) return;
    const sourceUrl = provenance?.sourceUrl ?? wc.getURL();
    DownloadService.pushPending(url, {
      actor: provenance?.actor ?? 'user',
      sourceUrl,
      sourceOrigin: provenance?.sourceOrigin ?? originOf(sourceUrl),
      correlationId: provenance?.correlationId,
      taskId: provenance?.taskId,
    });
    wc.downloadURL(url);
  }

  static create(input: DownloadCreateInput, wc?: WebContents | null): { idempotencyKey?: string } {
    const target = wc ?? null;
    if (target === null || target.isDestroyed()) {
      throw new AppError('No active web page can start this download', 404);
    }
    DownloadService.downloadURL(target, input.url, {
      actor: input.actor ?? 'agent',
      sourceUrl: input.sourceUrl,
      sourceOrigin: input.sourceUrl !== undefined ? originOf(input.sourceUrl) : undefined,
      correlationId: input.correlationId,
      taskId: input.taskId,
    });
    return input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {};
  }

  static async command(id: string, action: DownloadCommandAction): Promise<void> {
    const record = DownloadService.records.get(id);
    if (record === undefined) throw new AppError('Download not found', 404);
    if (action === 'pause') {
      record.item?.pause();
      DownloadService.patch(id, { status: 'paused', canResume: record.item?.canResume() ?? record.canResume });
    } else if (action === 'resume') {
      if (record.item?.canResume() === true) record.item.resume();
      DownloadService.patch(id, { status: 'in_progress', canResume: record.item?.canResume() ?? record.canResume });
    } else if (action === 'cancel') {
      record.item?.cancel();
      DownloadService.patch(id, { status: 'canceled', updatedAt: Date.now() });
      DownloadService.appendAudit('DownloadCanceled', DownloadService.records.get(id));
    } else if (action === 'release') {
      await DownloadService.release(id);
    } else if (action === 'open') {
      await DownloadService.open(id);
    } else if (action === 'reveal') {
      DownloadService.reveal(id);
    } else if (action === 'clear') {
      DownloadService.remove(id);
    } else {
      throw new AppError('Unsupported download command', 400);
    }
  }

  static clearTerminal(): void {
    const terminal = ['completed', 'blocked', 'canceled', 'failed'];
    for (const record of [...DownloadService.records.values()]) {
      if (terminal.includes(record.status)) DownloadService.records.delete(record.id);
    }
    const db = getDb();
    if (db !== null) DownloadStore.clearTerminal(db);
    DownloadService.broadcast();
  }

  private static pushPending(url: string, provenance: DownloadProvenance): void {
    const list = DownloadService.pendingByUrl.get(url) ?? [];
    list.push(provenance);
    DownloadService.pendingByUrl.set(url, list);
  }

  private static takePending(url: string): DownloadProvenance | undefined {
    const list = DownloadService.pendingByUrl.get(url);
    if (list === undefined || list.length === 0) return undefined;
    const next = list.shift();
    if (list.length === 0) DownloadService.pendingByUrl.delete(url);
    return next;
  }

  private static handleWillDownload(item: DownloadItem, wc: WebContents): void {
    const url = item.getURL();
    const pageUrl = wc.getURL();
    const pending = DownloadService.takePending(url);
    const provenance: DownloadProvenance = pending ?? {
      actor: 'site',
      sourceUrl: pageUrl,
      sourceOrigin: originOf(pageUrl),
    };
    const now = Date.now();
    const id = randomUUID();
    const filename = cleanFilename(item.getFilename());
    const mimeType = item.getMimeType() || undefined;
    const quarantineDir = join(app.getPath('userData'), 'Downloads', 'quarantine');
    mkdirSync(quarantineDir, { recursive: true });
    const quarantinePath = uniquePath(quarantineDir, `${id}-${filename}`);
    item.setSavePath(quarantinePath);

    const finalDir = DownloadService.downloadDirectory();
    const finalPath = uniquePath(finalDir, filename);
    const total = item.getTotalBytes();
    const record: ActiveDownload = {
      id,
      url,
      filename,
      ...(mimeType !== undefined ? { mimeType } : {}),
      status: 'in_progress',
      risk: classifyDownloadRisk(filename, mimeType),
      trustVerdict: 'unknown',
      receivedBytes: item.getReceivedBytes(),
      totalBytes: total > 0 ? total : null,
      canResume: item.canResume(),
      createdAt: now,
      updatedAt: now,
      provenance,
      quarantinePath,
      finalPath,
      item,
    };
    DownloadService.upsert(record);
    DownloadService.appendAudit('DownloadStarted', record);

    item.on('updated', (_event, state) => {
      DownloadService.patch(id, {
        status: state === 'interrupted' || item.isPaused() ? 'paused' : 'in_progress',
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes() > 0 ? item.getTotalBytes() : null,
        canResume: item.canResume(),
        updatedAt: Date.now(),
      });
      DownloadService.appendAudit('DownloadProgressed', DownloadService.records.get(id));
    });

    item.on('done', (_event, state) => {
      const current = DownloadService.records.get(id);
      if (current !== undefined) current.item = undefined;
      if (state === 'completed') {
        void DownloadService.finishToQuarantine(id);
      } else if (state === 'cancelled') {
        DownloadService.patch(id, { status: 'canceled', updatedAt: Date.now(), item: undefined });
        DownloadService.appendAudit('DownloadCanceled', DownloadService.records.get(id));
      } else {
        DownloadService.patch(id, {
          status: 'failed',
          error: state,
          updatedAt: Date.now(),
          item: undefined,
        });
        DownloadService.appendAudit('DownloadFailed', DownloadService.records.get(id));
      }
    });
  }

  private static async finishToQuarantine(id: string): Promise<void> {
    const record = DownloadService.records.get(id);
    if (record === undefined || record.quarantinePath === undefined) return;
    try {
      const sha256 = await sha256File(record.quarantinePath);
      const trustVerdict = await DownloadService.trustProvider.check({
        sha256,
        filename: record.filename,
        mimeType: record.mimeType,
        sourceOrigin: record.provenance.sourceOrigin,
      });
      DownloadService.patch(id, {
        status: trustVerdict === 'blocked' ? 'blocked' : 'quarantined',
        trustVerdict,
        sha256,
        receivedBytes: record.totalBytes ?? record.receivedBytes,
        canResume: false,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
      DownloadService.appendAudit(
        trustVerdict === 'blocked' ? 'DownloadBlocked' : 'DownloadQuarantined',
        DownloadService.records.get(id),
      );
    } catch (err) {
      Logger.warn('Failed to quarantine download', { id, err: String(err) });
      DownloadService.patch(id, {
        status: 'failed',
        error: String(err),
        updatedAt: Date.now(),
      });
      DownloadService.appendAudit('DownloadFailed', DownloadService.records.get(id));
    }
  }

  private static async release(id: string): Promise<void> {
    const record = DownloadService.records.get(id);
    if (record === undefined) throw new AppError('Download not found', 404);
    if (record.status !== 'quarantined') throw new AppError('Download is not ready to release', 409);
    if (record.trustVerdict === 'blocked') throw new AppError('Download was blocked by trust policy', 403);
    if (record.quarantinePath === undefined) throw new AppError('Quarantine file is missing', 404);

    let finalPath = record.finalPath ?? uniquePath(DownloadService.downloadDirectory(), record.filename);
    if (PreferenceStore.getAll().downloadAskEachTime) {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
      const result = win
        ? await dialog.showSaveDialog(win, { defaultPath: finalPath })
        : await dialog.showSaveDialog({ defaultPath: finalPath });
      if (result.canceled || result.filePath === undefined) return;
      finalPath = result.filePath;
    } else {
      finalPath = uniquePath(dirname(finalPath), basename(finalPath));
    }

    await moveFile(record.quarantinePath, finalPath);
    DownloadService.patch(id, {
      status: 'completed',
      finalPath,
      quarantinePath: undefined,
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });
    DownloadService.appendAudit('DownloadReleased', DownloadService.records.get(id));
  }

  private static async open(id: string): Promise<void> {
    const record = DownloadService.records.get(id);
    if (record === undefined) throw new AppError('Download not found', 404);
    if (record.status !== 'completed' || record.finalPath === undefined) {
      throw new AppError('Download has not been released yet', 409);
    }
    const err = await shell.openPath(record.finalPath);
    if (err.length > 0) throw new AppError(err, 500);
  }

  private static reveal(id: string): void {
    const record = DownloadService.records.get(id);
    if (record === undefined) throw new AppError('Download not found', 404);
    const path = record.finalPath ?? record.quarantinePath;
    if (path === undefined) throw new AppError('Download file path is unavailable', 404);
    shell.showItemInFolder(path);
  }

  private static remove(id: string): void {
    DownloadService.records.delete(id);
    const db = getDb();
    if (db !== null) DownloadStore.remove(db, id);
    DownloadService.broadcast();
  }

  private static downloadDirectory(): string {
    const configured = PreferenceStore.getAll().downloadDirectory.trim();
    const dir = configured.length > 0 ? configured : app.getPath('downloads');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private static upsert(record: ActiveDownload): void {
    DownloadService.records.set(record.id, record);
    DownloadService.persist(record);
    DownloadService.broadcast();
  }

  private static patch(id: string, patch: Partial<ActiveDownload>): void {
    const current = DownloadService.records.get(id);
    if (current === undefined) return;
    const next: ActiveDownload = { ...current, ...patch, updatedAt: patch.updatedAt ?? Date.now() };
    DownloadService.upsert(next);
  }

  private static persist(record: ActiveDownload): void {
    const db = getDb();
    if (db === null) return;
    try {
      DownloadStore.upsert(db, record);
    } catch (err) {
      Logger.warn('Failed to persist download projection', { id: record.id, err: String(err) });
    }
  }

  private static broadcast(): void {
    const state = DownloadService.state();
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IpcChannels.downloadsState, state);
    }
  }

  private static appendAudit(type: Parameters<typeof EventJournal.append>[1]['type'], record?: ActiveDownload): void {
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
          downloadId: record.id,
          filename: record.filename,
          status: record.status,
          risk: record.risk,
          trustVerdict: record.trustVerdict,
          sourceOrigin: record.provenance.sourceOrigin,
          taskId: record.provenance.taskId,
          receivedBytes: record.receivedBytes,
          totalBytes: record.totalBytes,
          sha256: record.sha256,
        },
      });
    } catch (err) {
      Logger.warn('Download audit append failed', { id: record.id, err: String(err) });
    }
  }
}

export default DownloadService;
