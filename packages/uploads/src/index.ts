export const UPLOAD_STATUSES = [
  'staged',
  'bound',
  'submitting',
  'completed',
  'failed',
  'canceled',
  'cleared',
] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export const UPLOAD_ACTORS = ['user', 'agent', 'site'] as const;
export type UploadActor = (typeof UPLOAD_ACTORS)[number];

export const UPLOAD_RISKS = ['normal', 'archive', 'script', 'executable', 'large'] as const;
export type UploadRisk = (typeof UPLOAD_RISKS)[number];

export const UPLOAD_COMMAND_ACTIONS = ['cancel', 'clear'] as const;
export type UploadCommandAction = (typeof UPLOAD_COMMAND_ACTIONS)[number];

export interface UploadFileRecord {
  filename: string;
  sizeBytes: number;
  mimeType?: string | undefined;
  risk: UploadRisk;
}

export interface UploadProvenance {
  actor: UploadActor;
  sourceUrl?: string | undefined;
  sourceOrigin?: string | undefined;
  correlationId?: string | undefined;
  taskId?: string | undefined;
}

export interface UploadRecord {
  id: string;
  tabId?: string | undefined;
  targetOrigin?: string | undefined;
  targetUrl?: string | undefined;
  ref?: number | undefined;
  purpose?: string | undefined;
  status: UploadStatus;
  risk: UploadRisk;
  files: UploadFileRecord[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number | undefined;
  error?: string | undefined;
  provenance: UploadProvenance;
}

export interface UploadsState {
  items: UploadRecord[];
}

export interface UploadCreateInput {
  tabId?: string | undefined;
  ref: number;
  paths: string[];
  purpose?: string | undefined;
  actor?: UploadActor | undefined;
  sourceUrl?: string | undefined;
  correlationId?: string | undefined;
  taskId?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface UploadCommandInput {
  id: string;
  action: UploadCommandAction;
}

export interface UploadStatePatch {
  id: string;
  patch: Partial<Omit<UploadRecord, 'id' | 'createdAt'>>;
}

export function emptyUploadsState(): UploadsState {
  return { items: [] };
}

export function upsertUpload(state: UploadsState, record: UploadRecord): UploadsState {
  const index = state.items.findIndex((item) => item.id === record.id);
  if (index === -1) return { items: [record, ...state.items] };
  const items = state.items.slice();
  items[index] = record;
  return { items };
}

export function patchUpload(state: UploadsState, input: UploadStatePatch): UploadsState {
  const current = state.items.find((item) => item.id === input.id);
  if (current === undefined) return state;
  return upsertUpload(state, {
    ...current,
    ...input.patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: input.patch.updatedAt ?? Date.now(),
  });
}

export function removeUpload(state: UploadsState, id: string): UploadsState {
  return { items: state.items.filter((item) => item.id !== id) };
}

export function getUpload(state: UploadsState, id: string): UploadRecord | undefined {
  return state.items.find((item) => item.id === id);
}

export function isTerminalUploadStatus(status: UploadStatus): boolean {
  return ['completed', 'failed', 'canceled', 'cleared'].includes(status);
}

const EXECUTABLE_EXTS = new Set([
  '.app',
  '.bat',
  '.cmd',
  '.com',
  '.dmg',
  '.exe',
  '.msi',
  '.ps1',
  '.scr',
]);
const SCRIPT_EXTS = new Set(['.js', '.jse', '.sh', '.vbs', '.wsf']);
const ARCHIVE_EXTS = new Set(['.7z', '.bz2', '.gz', '.rar', '.tar', '.xz', '.zip']);
const LARGE_UPLOAD_BYTES = 25 * 1024 * 1024;

function extensionOf(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot === -1 ? '' : lower.slice(dot);
}

export function classifyUploadRisk(input: {
  filename: string;
  mimeType?: string | undefined;
  sizeBytes?: number | undefined;
}): UploadRisk {
  const ext = extensionOf(input.filename);
  if (EXECUTABLE_EXTS.has(ext)) return 'executable';
  if (SCRIPT_EXTS.has(ext)) return 'script';
  if (ARCHIVE_EXTS.has(ext)) return 'archive';
  if (input.mimeType?.includes('application/x-msdownload') === true) return 'executable';
  if (input.mimeType?.includes('application/x-sh') === true) return 'script';
  if ((input.sizeBytes ?? 0) > LARGE_UPLOAD_BYTES) return 'large';
  return 'normal';
}

export function aggregateUploadRisk(files: readonly UploadFileRecord[]): UploadRisk {
  if (files.some((file) => file.risk === 'executable')) return 'executable';
  if (files.some((file) => file.risk === 'script')) return 'script';
  if (files.some((file) => file.risk === 'archive')) return 'archive';
  if (files.some((file) => file.risk === 'large')) return 'large';
  return 'normal';
}

export function uploadNeedsApproval(record: UploadRecord): boolean {
  if (record.provenance.actor !== 'user') return true;
  return record.risk !== 'normal';
}
