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

const EXECUTABLE_EXTS = new Set([
  '.app',
  '.bat',
  '.cmd',
  '.com',
  '.exe',
  '.msi',
  '.ps1',
  '.scr',
]);
const SCRIPT_EXTS = new Set(['.js', '.jse', '.sh', '.vbs', '.wsf']);
const ARCHIVE_EXTS = new Set(['.7z', '.bz2', '.gz', '.rar', '.tar', '.xz', '.zip']);

function extensionOf(filename: string): string {
  const lower = filename.toLowerCase();
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

export function releaseNeedsApproval(record: DownloadRecord): boolean {
  if (record.status !== 'quarantined') return false;
  if (record.trustVerdict === 'blocked') return true;
  if (record.provenance.actor === 'agent') return true;
  return record.risk === 'executable' || record.risk === 'script';
}

export function commandNeedsApproval(record: DownloadRecord, action: DownloadCommandAction): boolean {
  if (action === 'release') return releaseNeedsApproval(record);
  if (action === 'open') return record.risk !== 'normal' || record.trustVerdict !== 'safe';
  return false;
}
