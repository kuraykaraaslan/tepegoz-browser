import type { DownloadItem } from 'electron';
import type { DownloadRecord, DownloadTrustVerdict } from '@tepegoz/downloads';
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

export function publicRecord(record: ActiveDownload): DownloadRecord {
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
