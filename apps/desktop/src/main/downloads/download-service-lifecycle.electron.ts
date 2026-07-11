import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, type DownloadItem, type WebContents } from 'electron';
import { classifyDownloadRisk, type DownloadProvenance } from '@tepegoz/downloads';
import { Logger } from '@tepegoz/libs';
import { cleanFilename, originOf, sha256File, uniquePath } from './download-service-fs.electron';
import type { ActiveDownload } from './download-service-model.electron';
import {
  appendAudit,
  downloadDirectory,
  patch,
  takePending,
  upsert,
  type DownloadState,
} from './download-service-store.electron';

export function handleWillDownload(state: DownloadState, item: DownloadItem, wc: WebContents): void {
  const url = item.getURL();
  const pageUrl = wc.getURL();
  const pending = takePending(state, url);
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

  const finalDir = downloadDirectory();
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
  upsert(state, record);
  appendAudit('DownloadStarted', record);

  item.on('updated', (_event, updateState) => {
    patch(state, id, {
      status: updateState === 'interrupted' || item.isPaused() ? 'paused' : 'in_progress',
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes() > 0 ? item.getTotalBytes() : null,
      canResume: item.canResume(),
      updatedAt: Date.now(),
    });
    appendAudit('DownloadProgressed', state.records.get(id));
  });

  item.on('done', (_event, doneState) => {
    const current = state.records.get(id);
    if (current !== undefined) current.item = undefined;
    if (doneState === 'completed') {
      void finishToQuarantine(state, id);
    } else if (doneState === 'cancelled') {
      patch(state, id, { status: 'canceled', updatedAt: Date.now(), item: undefined });
      appendAudit('DownloadCanceled', state.records.get(id));
    } else {
      patch(state, id, {
        status: 'failed',
        error: doneState,
        updatedAt: Date.now(),
        item: undefined,
      });
      appendAudit('DownloadFailed', state.records.get(id));
    }
  });
}

export async function finishToQuarantine(state: DownloadState, id: string): Promise<void> {
  const record = state.records.get(id);
  if (record === undefined || record.quarantinePath === undefined) return;
  try {
    const sha256 = await sha256File(record.quarantinePath);
    const trustVerdict = await state.trustProvider.check({
      sha256,
      filename: record.filename,
      mimeType: record.mimeType,
      sourceOrigin: record.provenance.sourceOrigin,
    });
    patch(state, id, {
      status: trustVerdict === 'blocked' ? 'blocked' : 'quarantined',
      trustVerdict,
      sha256,
      receivedBytes: record.totalBytes ?? record.receivedBytes,
      canResume: false,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    appendAudit(
      trustVerdict === 'blocked' ? 'DownloadBlocked' : 'DownloadQuarantined',
      state.records.get(id),
    );
  } catch (err) {
    Logger.warn('Failed to quarantine download', { id, err: String(err) });
    patch(state, id, {
      status: 'failed',
      error: String(err),
      updatedAt: Date.now(),
    });
    appendAudit('DownloadFailed', state.records.get(id));
  }
}
