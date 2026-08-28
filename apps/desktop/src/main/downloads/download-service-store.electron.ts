import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { app, BrowserWindow } from 'electron';
import type {
  DownloadProvenance,
  DownloadRate,
  DownloadRateSample,
  DownloadRecord,
  DownloadsState,
} from '@tepegoz/downloads';
import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import { DownloadStore, EventJournal } from '@tepegoz/persistence';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { getDb } from '../db/database.electron';
import {
  publicRecord,
  unknownTrustProvider,
  type ActiveDownload,
  type DownloadTrustProvider,
} from './download-service-model.electron';

type AuditType = Parameters<typeof EventJournal.append>[1]['type'];

/** The live rate window for one in-progress download. In-memory only — never persisted or journaled. */
export interface DownloadRateTracking {
  samples: DownloadRateSample[];
  current: DownloadRate | null;
}

/** Mutable shared state passed between the download service collaborators. */
export interface DownloadState {
  readonly records: Map<string, ActiveDownload>;
  readonly pendingByUrl: Map<string, DownloadProvenance[]>;
  /** Sliding-window transfer-rate estimates, keyed by download id. Dropped when a download stops. */
  readonly rates: Map<string, DownloadRateTracking>;
  trustProvider: DownloadTrustProvider;
}

export function createState(): DownloadState {
  return {
    records: new Map<string, ActiveDownload>(),
    pendingByUrl: new Map<string, DownloadProvenance[]>(),
    rates: new Map<string, DownloadRateTracking>(),
    trustProvider: unknownTrustProvider,
  };
}

export function list(state: DownloadState): DownloadRecord[] {
  return [...state.records.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((record) => publicRecord(record, state.rates.get(record.id)?.current ?? null));
}

export function snapshot(state: DownloadState): DownloadsState {
  return { items: list(state) };
}

export function pushPending(
  state: DownloadState,
  url: string,
  provenance: DownloadProvenance,
): void {
  const existing = state.pendingByUrl.get(url) ?? [];
  existing.push(provenance);
  state.pendingByUrl.set(url, existing);
}

export function takePending(state: DownloadState, url: string): DownloadProvenance | undefined {
  const existing = state.pendingByUrl.get(url);
  if (existing === undefined || existing.length === 0) return undefined;
  const next = existing.shift();
  if (existing.length === 0) state.pendingByUrl.delete(url);
  return next;
}

export function downloadDirectory(): string {
  const configured = PreferenceStore.getAll().downloadDirectory.trim();
  const dir = configured.length > 0 ? configured : app.getPath('downloads');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function persist(record: ActiveDownload): void {
  const db = getDb();
  if (db === null) return;
  try {
    DownloadStore.upsert(db, record);
  } catch (err) {
    Logger.warn('Failed to persist download projection', { id: record.id, err: String(err) });
  }
}

export function broadcast(state: DownloadState): void {
  const next = snapshot(state);
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IpcChannels.downloadsState, next);
  }
}

export function upsert(state: DownloadState, record: ActiveDownload): void {
  state.records.set(record.id, record);
  persist(record);
  broadcast(state);
}

export function patch(state: DownloadState, id: string, patchValue: Partial<ActiveDownload>): void {
  const current = state.records.get(id);
  if (current === undefined) return;
  const next: ActiveDownload = {
    ...current,
    ...patchValue,
    updatedAt: patchValue.updatedAt ?? Date.now(),
  };
  upsert(state, next);
}

export function removeRecord(state: DownloadState, id: string): void {
  state.records.delete(id);
  state.rates.delete(id);
  const db = getDb();
  if (db !== null) DownloadStore.remove(db, id);
  broadcast(state);
}

/** Drops every finished transfer and reports HOW MANY — the caller is a user action that should be
 *  able to say "42 removed" rather than leaving the person to diff a list they were already done with. */
export function clearTerminal(state: DownloadState): number {
  const terminal = ['completed', 'blocked', 'canceled', 'failed'];
  let removed = 0;
  for (const record of [...state.records.values()]) {
    if (terminal.includes(record.status)) {
      state.records.delete(record.id);
      state.rates.delete(record.id);
      removed += 1;
    }
  }
  const db = getDb();
  if (db !== null) DownloadStore.clearTerminal(db);
  broadcast(state);
  return removed;
}

export function appendAudit(type: AuditType, record?: ActiveDownload): void {
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
