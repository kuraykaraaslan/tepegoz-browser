import { basename, dirname } from 'node:path';
import { BrowserWindow, dialog, shell, type WebContents } from 'electron';
import { isRetryableStatus, type DownloadCommandAction } from '@tepegoz/downloads';
import { AppError } from '@tepegoz/libs';
import { resumeInterrupted, resumeRefusal } from './download-service-resume.electron';
import PreferenceStore from '@tepegoz/preferences';
import { moveFile, uniquePath } from './download-service-fs.electron';
import {
  applyRetentionPolicy,
  appendAudit,
  downloadDirectory,
  patch,
  pushPending,
  removeRecord,
  type DownloadState,
} from './download-service-store.electron';

export async function runCommand(
  state: DownloadState,
  id: string,
  action: DownloadCommandAction,
  wc?: WebContents | null,
): Promise<void> {
  const record = state.records.get(id);
  if (record === undefined) throw new AppError('Download not found', 404, 'downloadNotFound');
  if (action === 'retry') {
    retry(state, id, wc ?? null);
    return;
  }
  if (action === 'pause') {
    record.item?.pause();
    patch(state, id, {
      status: 'paused',
      canResume: record.item?.canResume() ?? record.canResume,
    });
  } else if (action === 'resume') {
    if (record.item?.canResume() === true) {
      record.item.resume();
      patch(state, id, { status: 'in_progress', canResume: record.item.canResume() });
    } else if (record.item === undefined) {
      // No live item: the app was restarted (or the session that owned it went away). Before this,
      // the row was simply set to `in_progress` and nothing moved — a button that reports success and
      // does nothing, which is worse than one that is disabled.
      const plan = resumeInterrupted(state, record);
      if (plan.action !== 'resume') throw resumeRefusal(plan);
    } else {
      // A live item that says it cannot resume is a fact, not a state to overwrite.
      patch(state, id, { canResume: false });
    }
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
    throw new AppError('Unsupported download command', 400, 'unsupportedCommand');
  }
}

/**
 * Start a failed/canceled download over. It re-enters the SAME `will-download` path — quarantine, hash,
 * trust check, HITL release gate — so a retry can never be a shortcut around any of that; the old
 * record is dropped and the fresh attempt takes its place (Chrome-style).
 *
 * It needs a live web page to attach the transfer to, and uses THAT page's session on purpose: we do
 * not record which browsing session (Direct / a Phase 5 tunnel) the original ran on, and silently
 * retrying a tunnel-bound download on the clear path would be the exact leak the tab model guards
 * against elsewhere. Retrying from the page you are on keeps it on the route you can see.
 */
function retry(state: DownloadState, id: string, wc: WebContents | null): void {
  const record = state.records.get(id);
  if (record === undefined) throw new AppError('Download not found', 404, 'downloadNotFound');
  if (!isRetryableStatus(record.status))
    throw new AppError(
      'Only a failed or canceled download can be retried',
      409,
      'downloadNotRetryable',
    );
  if (wc === null || wc.isDestroyed())
    throw new AppError('No active web page can start this download', 404, 'downloadNoActivePage');
  removeRecord(state, id);
  pushPending(state, record.url, { ...record.provenance });
  wc.downloadURL(record.url);
}

async function release(state: DownloadState, id: string): Promise<void> {
  const record = state.records.get(id);
  if (record === undefined) throw new AppError('Download not found', 404, 'downloadNotFound');
  if (record.status !== 'quarantined')
    throw new AppError('Download is not ready to release', 409, 'downloadNotReadyToRelease');
  if (record.trustVerdict === 'blocked')
    throw new AppError('Download was blocked by trust policy', 403, 'downloadBlocked');
  if (record.quarantinePath === undefined)
    throw new AppError('Quarantine file is missing', 404, 'downloadFileMissing');

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
  // `on-completion` means this moment: the file has left quarantine and is on disk where the user
  // asked for it, so the list row has done its job.
  applyRetentionPolicy(state);
}

async function openDownload(state: DownloadState, id: string): Promise<void> {
  const record = state.records.get(id);
  if (record === undefined) throw new AppError('Download not found', 404, 'downloadNotFound');
  if (record.status !== 'completed' || record.finalPath === undefined) {
    throw new AppError('Download has not been released yet', 409, 'downloadNotReleased');
  }
  const err = await shell.openPath(record.finalPath);
  if (err.length > 0) throw new AppError(err, 500);
}

function reveal(state: DownloadState, id: string): void {
  const record = state.records.get(id);
  if (record === undefined) throw new AppError('Download not found', 404, 'downloadNotFound');
  const path = record.finalPath ?? record.quarantinePath;
  if (path === undefined)
    throw new AppError('Download file path is unavailable', 404, 'downloadFileMissing');
  shell.showItemInFolder(path);
}
