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

// A runnable binary or an OS-level installer — releasing one runs code. Covers the Windows set
// (`.exe/.com/.scr/.pif`, the Script-Host-adjacent `.hta/.scf`, `.cpl/.msc` control-panel/console
// snap-ins, `.reg` registry merge, `.msi/.msp` installers, `.msix/.appx` packages) plus the
// per-OS installer formats named in the phase's download line (`.dmg/.pkg` macOS, `.deb/.rpm`
// Linux, `.appimage`) and `.jar` (Chromium treats it as dangerous — it launches under the JRE).
const EXECUTABLE_EXTS = new Set([
  '.app',
  '.appimage',
  '.appx',
  '.bat',
  '.cmd',
  '.com',
  '.cpl',
  '.deb',
  '.dmg',
  '.exe',
  '.hta',
  '.jar',
  '.msc',
  '.msi',
  '.msix',
  '.msp',
  '.pif',
  '.pkg',
  '.ps1',
  '.reg',
  '.rpm',
  '.scf',
  '.scr',
]);
// Interpreted source — harmless as bytes, dangerous the moment a shell/interpreter is pointed at it.
const SCRIPT_EXTS = new Set([
  '.bash',
  '.command',
  '.js',
  '.jse',
  '.php',
  '.pl',
  '.psm1',
  '.py',
  '.rb',
  '.sh',
  '.vbe',
  '.vbs',
  '.ws',
  '.wsc',
  '.wsf',
  '.wsh',
]);
const ARCHIVE_EXTS = new Set([
  '.7z',
  '.bz2',
  '.gz',
  '.iso',
  '.img',
  '.rar',
  '.tar',
  '.tgz',
  '.xz',
  '.zip',
]);

// MIME the server may send instead of (or alongside) a telltale extension. Matched on the essence
// only — parameters and casing stripped — so `application/x-sh; charset=utf-8` still lands.
const EXECUTABLE_MIMES = new Set([
  'application/x-msdownload',
  'application/x-ms-installer',
  'application/x-msi',
  'application/vnd.microsoft.portable-executable',
  'application/x-msdos-program',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-elf',
  'application/x-mach-binary',
  'application/x-apple-diskimage',
  'application/vnd.debian.binary-package',
  'application/x-rpm',
  'application/x-redhat-package-manager',
]);
const SCRIPT_MIMES = new Set([
  'application/x-sh',
  'application/x-shellscript',
  'text/x-shellscript',
  'application/x-csh',
  'application/x-perl',
  'text/x-perl',
  'application/x-python',
  'text/x-python',
  'application/x-python-code',
  'application/x-ruby',
  'text/x-ruby',
]);

function extensionOf(filename: string): string {
  // Windows silently strips trailing dots and spaces from a path component, so `evil.exe.` and
  // `evil.exe ` both land on disk — and run under ShellExecute — as `evil.exe`. Normalize the same
  // way before reading the extension: without this, one trailing character walks a payload straight
  // past the risk classifier as `normal` (measured: `report.exe.` → ext `.` → normal).
  const lower = filename.toLowerCase().replace(/[.\s]+$/u, '');
  const dot = lower.lastIndexOf('.');
  return dot === -1 ? '' : lower.slice(dot);
}

/** The MIME essence — lowercased, parameters (`; charset=…`) and surrounding space removed. */
function mimeEssence(mimeType: string | undefined): string {
  return (mimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

export function classifyDownloadRisk(filename: string, mimeType?: string): DownloadRisk {
  const ext = extensionOf(filename);
  if (EXECUTABLE_EXTS.has(ext)) return 'executable';
  if (SCRIPT_EXTS.has(ext)) return 'script';
  if (ARCHIVE_EXTS.has(ext)) return 'archive';
  const mime = mimeEssence(mimeType);
  if (EXECUTABLE_MIMES.has(mime)) return 'executable';
  if (SCRIPT_MIMES.has(mime)) return 'script';
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
  const etaSeconds = remaining !== null && bytesPerSecond > 0 ? remaining / bytesPerSecond : null;
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

/**
 * Whether to surface a "contents unexamined" warning for an archive. The quarantine hash and the
 * Safe Browsing check both look at the archive FILE; nothing looks inside it, so a zip/rar that
 * passed can still expand to an executable. This is a content warning, not a release gate — an
 * archive is not itself dangerous to have on disk (`releaseNeedsApproval` stays false for it) — so
 * it shows only while the file exists and can actually be opened.
 */
export function archiveContentsUnverified(record: DownloadRecord): boolean {
  if (record.risk !== 'archive') return false;
  return record.status === 'quarantined' || record.status === 'completed';
}

/**
 * How long a finished download stays in the LIST. The file on disk is never involved.
 *
 * `manual` is the default and the only policy that never deletes on its own: a download list that
 * quietly empties itself is one the user cannot use to answer "did I actually download that?", which
 * is most of what the list is for.
 */
export const DOWNLOAD_RETENTION_POLICIES = ['manual', 'after-day', 'on-completion'] as const;
export type DownloadRetentionPolicy = (typeof DOWNLOAD_RETENTION_POLICIES)[number];

/** A day, as the retention policy means it. */
const RETENTION_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which records the retention policy would remove from the list, by id.
 *
 * Pure, so the rule is testable without a database or a clock, and because the two callers (startup
 * sweep and post-completion sweep) must not be able to disagree about it.
 *
 * Three rules hold for every policy:
 *
 *  - **Only terminal records.** A transfer in flight is not history; its row is what tracks it, and
 *    removing that would leave a download nothing is watching.
 *  - **Never a quarantined record.** It is terminal in the sense that no bytes are moving, but the
 *    file is still sitting in quarantine waiting for a release decision — dropping the row would
 *    strand the file with no way to reach it from the UI.
 *  - **Never a blocked or failed one under `on-completion`.** "As soon as they finish" means finished
 *    SUCCESSFULLY; a download that failed is exactly the one the user comes back to look for.
 */
export function downloadsToForget(
  records: readonly DownloadRecord[],
  policy: DownloadRetentionPolicy,
  now: number,
): string[] {
  if (policy === 'manual') return [];
  return records
    .filter((record) => {
      if (record.status === 'completed') {
        return policy === 'on-completion' || now - record.updatedAt >= RETENTION_DAY_MS;
      }
      // `after-day` sweeps the whole terminal set, because a week-old failed attempt is clutter by
      // then; `on-completion` deliberately keeps them.
      if (policy !== 'after-day') return false;
      return (
        (record.status === 'canceled' || record.status === 'failed' || record.status === 'blocked') &&
        now - record.updatedAt >= RETENTION_DAY_MS
      );
    })
    .map((record) => record.id);
}
