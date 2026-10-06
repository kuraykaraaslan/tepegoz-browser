export const DOWNLOAD_STATUSES = [
  'requested',
  'in_progress',
  'paused',
  'quarantined',
  'completed',
  'blocked',
  'canceled',
  'failed',
] as const;
export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];

export const DOWNLOAD_ACTORS = ['user', 'agent', 'site'] as const;
export type DownloadActor = (typeof DOWNLOAD_ACTORS)[number];

export const DOWNLOAD_TRUST_VERDICTS = ['safe', 'unknown', 'blocked'] as const;
export type DownloadTrustVerdict = (typeof DOWNLOAD_TRUST_VERDICTS)[number];

export const DOWNLOAD_RISKS = ['normal', 'archive', 'script', 'executable'] as const;
export type DownloadRisk = (typeof DOWNLOAD_RISKS)[number];

export const DOWNLOAD_COMMAND_ACTIONS = [
  'pause',
  'resume',
  'cancel',
  'open',
  'reveal',
  'release',
  'clear',
  'retry',
] as const;
export type DownloadCommandAction = (typeof DOWNLOAD_COMMAND_ACTIONS)[number];

export interface DownloadProvenance {
  actor: DownloadActor;
  sourceUrl?: string | undefined;
  sourceOrigin?: string | undefined;
  correlationId?: string | undefined;
  taskId?: string | undefined;
}

export interface DownloadRecord {
  id: string;
  url: string;
  filename: string;
  mimeType?: string | undefined;
  status: DownloadStatus;
  risk: DownloadRisk;
  trustVerdict: DownloadTrustVerdict;
  receivedBytes: number;
  totalBytes: number | null;
  canResume: boolean;
  /**
   * Live transfer rate in bytes/second, present only while the download is actively moving. Derived
   * from a short sliding window of progress samples — it is NEVER persisted or journaled (it is
   * meaningless once the transfer stops), so a record read back from disk or the audit log has it
   * absent.
   */
  bytesPerSecond?: number | undefined;
  /**
   * Estimated seconds remaining, present only while actively transferring. `null` when it cannot be
   * estimated (total size unknown, or the rate is momentarily zero). Same lifetime as
   * {@link bytesPerSecond}.
   */
  etaSeconds?: number | null | undefined;
  createdAt: number;
  updatedAt: number;
  completedAt?: number | undefined;
  error?: string | undefined;
  sha256?: string | undefined;
  provenance: DownloadProvenance;
}

export interface DownloadsState {
  items: DownloadRecord[];
}

export interface DownloadCreateInput {
  url: string;
  filename?: string | undefined;
  actor?: DownloadActor | undefined;
  sourceUrl?: string | undefined;
  correlationId?: string | undefined;
  taskId?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface DownloadCommandInput {
  id: string;
  action: DownloadCommandAction;
}

export interface DownloadStatePatch {
  id: string;
  patch: Partial<Omit<DownloadRecord, 'id' | 'createdAt'>>;
}
