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

export function emptyDownloadsState(): DownloadsState {
  return { items: [] };
}

export function upsertDownload(state: DownloadsState, record: DownloadRecord): DownloadsState {
  const index = state.items.findIndex((item) => item.id === record.id);
  if (index === -1) return { items: [record, ...state.items] };
  const items = state.items.slice();
  items[index] = record;
  return { items };
}

export function patchDownload(state: DownloadsState, input: DownloadStatePatch): DownloadsState {
  const current = state.items.find((item) => item.id === input.id);
  if (current === undefined) return state;
  return upsertDownload(state, {
    ...current,
    ...input.patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: input.patch.updatedAt ?? Date.now(),
  });
}

export function removeDownload(state: DownloadsState, id: string): DownloadsState {
  return { items: state.items.filter((item) => item.id !== id) };
}

export function clearInactiveDownloads(state: DownloadsState): DownloadsState {
  return {
    items: state.items.filter((item) =>
      ['requested', 'in_progress', 'paused', 'quarantined'].includes(item.status),
    ),
  };
}

export function getDownload(state: DownloadsState, id: string): DownloadRecord | undefined {
  return state.items.find((item) => item.id === id);
}

export function activeDownloads(state: DownloadsState): DownloadRecord[] {
  return state.items.filter((item) =>
    ['requested', 'in_progress', 'paused', 'quarantined'].includes(item.status),
  );
}

export function isTerminalDownloadStatus(status: DownloadStatus): boolean {
  return ['completed', 'blocked', 'canceled', 'failed'].includes(status);
}

const EXECUTABLE_EXTS = new Set(['.app', '.bat', '.cmd', '.com', '.exe', '.msi', '.ps1', '.scr']);
const SCRIPT_EXTS = new Set(['.js', '.jse', '.sh', '.vbs', '.wsf']);
const ARCHIVE_EXTS = new Set(['.7z', '.bz2', '.gz', '.rar', '.tar', '.xz', '.zip']);

function extensionOf(filename: string): string {
  // Windows silently strips trailing dots and spaces from a path component, so `evil.exe.` and
  // `evil.exe ` both land on disk — and run under ShellExecute — as `evil.exe`. Normalize the same
  // way before reading the extension: without this, one trailing character walks a payload straight
  // past the risk classifier as `normal` (measured: `report.exe.` → ext `.` → normal).
  const lower = filename.toLowerCase().replace(/[.\s]+$/u, '');
  const dot = lower.lastIndexOf('.');
  return dot === -1 ? '' : lower.slice(dot);
}

export function classifyDownloadRisk(filename: string, mimeType?: string): DownloadRisk {
  const ext = extensionOf(filename);
  if (EXECUTABLE_EXTS.has(ext)) return 'executable';
  if (SCRIPT_EXTS.has(ext)) return 'script';
  if (ARCHIVE_EXTS.has(ext)) return 'archive';
  if (mimeType?.includes('application/x-msdownload') === true) return 'executable';
  if (mimeType?.includes('application/x-sh') === true) return 'script';
  return 'normal';
}

/** One progress observation for the sliding-window rate estimate. */
export interface DownloadRateSample {
  /** `Date.now()` when the byte count was read. */
  at: number;
  receivedBytes: number;
}

/** The derived transfer rate + ETA for a set of samples. */
export interface DownloadRate {
  bytesPerSecond: number;
  /** `null` when there is no total to estimate against, or the rate is zero. */
  etaSeconds: number | null;
}

/**
 * Transfer rate + ETA from a sliding window of progress samples. Pure so it is unit-tested directly
 * (the desktop service just keeps the window trimmed and feeds it in). Returns `null` until there are
 * two usable samples — a single point has no rate, and a browser that guessed one would only ever be
 * wrong.
 */
export function computeDownloadRate(
  samples: readonly DownloadRateSample[],
  totalBytes: number | null,
): DownloadRate | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined || first === last) return null;
  const spanMs = last.at - first.at;
  const spanBytes = last.receivedBytes - first.receivedBytes;
  // A non-positive span (clock skew, a paused/rewound transfer) is not a rate we can trust.
  if (spanMs <= 0 || spanBytes < 0) return null;
  const bytesPerSecond = (spanBytes * 1000) / spanMs;
  const remaining = totalBytes !== null ? Math.max(0, totalBytes - last.receivedBytes) : null;
  const etaSeconds =
    remaining !== null && bytesPerSecond > 0 ? remaining / bytesPerSecond : null;
  return { bytesPerSecond, etaSeconds };
}

/** Whether a command action is a "start it over" that only a stopped download accepts. */
export function isRetryableStatus(status: DownloadStatus): boolean {
  return status === 'failed' || status === 'canceled';
}

export function releaseNeedsApproval(record: DownloadRecord): boolean {
  if (record.status !== 'quarantined') return false;
  if (record.trustVerdict === 'blocked') return true;
  if (record.provenance.actor === 'agent') return true;
  return record.risk === 'executable' || record.risk === 'script';
}

export function commandNeedsApproval(
  record: DownloadRecord,
  action: DownloadCommandAction,
): boolean {
  if (action === 'release') return releaseNeedsApproval(record);
  if (action === 'open') return record.risk !== 'normal' || record.trustVerdict !== 'safe';
  return false;
}
