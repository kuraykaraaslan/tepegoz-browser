import type { DownloadCommandAction, DownloadRecord, DownloadRisk } from './download-types';

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
