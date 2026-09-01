export const en = {
  title: 'Downloads',
  empty: 'No downloads yet',
  loading: 'Loading...',
  progressUnknown: 'Progress unknown',
  /** Appended after a transfer speed, e.g. "1.2 MB" + "/s". */
  perSecond: '/s',
  /** Follows the ETA duration, e.g. "0:42 left". */
  etaLeft: 'left',
  bytes: {
    b: 'B',
    kb: 'KB',
    mb: 'MB',
    gb: 'GB',
  },
  status: {
    requested: 'Requested',
    in_progress: 'Downloading',
    paused: 'Paused',
    quarantined: 'In quarantine',
    completed: 'Completed',
    blocked: 'Blocked',
    canceled: 'Canceled',
    failed: 'Failed',
  },
  trust: {
    safe: 'Safe',
    unknown: 'Unchecked',
    blocked: 'Blocked',
  },
  risk: {
    normal: 'Normal',
    archive: 'Archive',
    script: 'Script',
    executable: 'Executable',
  },
  action: {
    pause: 'Pause',
    resume: 'Resume',
    cancel: 'Cancel',
    release: 'Release',
    open: 'Open',
    reveal: 'Show in folder',
    clear: 'Clear',
    retry: 'Retry',
  },
  riskyRelease: 'This file needs your approval before it leaves quarantine.',
  archiveWarning: "This archive wasn't scanned inside — check its contents before you open them.",
};

export type DownloadsStrings = typeof en;
