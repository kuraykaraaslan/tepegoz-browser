import { basename, dirname } from 'node:path';
import { BrowserWindow, dialog, shell } from 'electron';
import type { DownloadCommandAction } from '@tepegoz/downloads';
import { AppError } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import { moveFile, uniquePath } from './download-service-fs.electron';
import {
  appendAudit,
  downloadDirectory,
  patch,
  removeRecord,
  type DownloadState,
} from './download-service-store.electron';

export async function runCommand(
  state: DownloadState,
  id: string,
  action: DownloadCommandAction,
): Promise<void> {
  const record = state.records.get(id);
  if (record === undefined) throw new AppError('Download not found', 404);
  if (action === 'pause') {
    record.item?.pause();
    patch(state, id, {
      status: 'paused',
      canResume: record.item?.canResume() ?? record.canResume,
    });
  } else if (action === 'resume') {
    if (record.item?.canResume() === true) record.item.resume();
    patch(state, id, {
      status: 'in_progress',
      canResume: record.item?.canResume() ?? record.canResume,
    });
  } else if (action === 'cancel') {
    record.item?.cancel();
    patch(state, id, { status: 'canceled', updatedAt: Date.now() });
    appendAudit('DownloadCanceled', state.records.get(id));
  } else if (action === 'release') {
    await release(state, id);
  } else if (action === 'open') {
    await openDownload(state, id);
  } else if (action === 'reveal') {
    reveal(state, id);
  } else if (action === 'clear') {
    removeRecord(state, id);
  } else {
    throw new AppError('Unsupported download command', 400);
  }
}

async function release(state: DownloadState, id: string): Promise<void> {
  const record = state.records.get(id);
  if (record === undefined) throw new AppError('Download not found', 404);
  if (record.status !== 'quarantined') throw new AppError('Download is not ready to release', 409);
  if (record.trustVerdict === 'blocked') throw new AppError('Download was blocked by trust policy', 403);
  if (record.quarantinePath === undefined) throw new AppError('Quarantine file is missing', 404);

  let finalPath = record.finalPath ?? uniquePath(downloadDirectory(), record.filename);
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
  patch(state, id, {
    status: 'completed',
    finalPath,
    quarantinePath: undefined,
    updatedAt: Date.now(),
    completedAt: Date.now(),
  });
  appendAudit('DownloadReleased', state.records.get(id));
}

async function openDownload(state: DownloadState, id: string): Promise<void> {
  const record = state.records.get(id);
  if (record === undefined) throw new AppError('Download not found', 404);
  if (record.status !== 'completed' || record.finalPath === undefined) {
    throw new AppError('Download has not been released yet', 409);
  }
  const err = await shell.openPath(record.finalPath);
  if (err.length > 0) throw new AppError(err, 500);
}

function reveal(state: DownloadState, id: string): void {
  const record = state.records.get(id);
  if (record === undefined) throw new AppError('Download not found', 404);
  const path = record.finalPath ?? record.quarantinePath;
  if (path === undefined) throw new AppError('Download file path is unavailable', 404);
  shell.showItemInFolder(path);
}
