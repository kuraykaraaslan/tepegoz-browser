export const en = {
  title: 'Uploads',
  empty: 'No uploads yet',
  loading: 'Loading...',
  files: 'Files',
  bytes: {
    b: 'B',
    kb: 'KB',
    mb: 'MB',
    gb: 'GB',
  },
  status: {
    staged: 'Staged',
    bound: 'Ready',
    submitting: 'Uploading',
    completed: 'Completed',
    failed: 'Failed',
    canceled: 'Canceled',
    cleared: 'Cleared',
  },
  risk: {
    normal: 'Normal',
    archive: 'Archive',
    script: 'Script',
    executable: 'Executable',
    large: 'Large',
  },
  actor: {
    user: 'User',
    agent: 'Agent',
    site: 'Site',
  },
  action: {
    cancel: 'Cancel',
    clear: 'Clear',
  },
  redacted: 'Local file paths are hidden.',
};

export type UploadsStrings = typeof en;
