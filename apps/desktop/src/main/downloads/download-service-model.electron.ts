import type { DownloadItem } from 'electron';
import type { DownloadRate, DownloadRecord, DownloadTrustVerdict } from '@tepegoz/downloads';
import type { PersistedDownload } from '@tepegoz/persistence';

export interface ActiveDownload extends PersistedDownload {
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

export const unknownTrustProvider: DownloadTrustProvider = {
  check: () => Promise.resolve('unknown'),
};

/**
 * Project the persisted/in-memory record to the renderer-facing shape. `rate` is the LIVE transfer
 * estimate held only in memory — it is passed in rather than read off the record because it is never
 * persisted or journaled (see `DownloadRecord.bytesPerSecond`). Only attached while the download is
 * actually in progress; a paused/terminal row shows no speed.
 */
export function publicRecord(record: ActiveDownload, rate?: DownloadRate | null): DownloadRecord {
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
    ...(record.status === 'in_progress' && rate != null
      ? { bytesPerSecond: rate.bytesPerSecond, etaSeconds: rate.etaSeconds }
      : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.completedAt !== undefined ? { completedAt: record.completedAt } : {}),
    ...(record.error !== undefined ? { error: record.error } : {}),
    ...(record.sha256 !== undefined ? { sha256: record.sha256 } : {}),
    provenance: record.provenance,
  };
}
