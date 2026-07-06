export const en = {
  title: 'Downloads',
  empty: 'No downloads yet',
  loading: 'Loading...',
  progressUnknown: 'Progress unknown',
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
  },
  riskyRelease: 'This file needs your approval before it leaves quarantine.',
};

export type DownloadsStrings = typeof en;
