export const en = {
  title: 'Tasks',
  createTitle: 'Create task',
  name: 'Name',
  prompt: 'Prompt',
  targetUrl: 'Target URL',
  intervalMinutes: 'Interval minutes',
  save: 'Save task',
  runNow: 'Run now',
  enable: 'Enable',
  disable: 'Disable',
  empty: 'No saved tasks yet',
  runs: 'Runs',
  artifacts: 'Artifacts',
  loading: 'Loading...',
  status: {
    enabled: 'Enabled',
    disabled: 'Disabled',
    archived: 'Archived',
  },
  runStatus: {
    queued: 'Queued',
    running: 'Running',
    awaiting_approval: 'Needs approval',
    succeeded: 'Succeeded',
    failed: 'Failed',
    canceled: 'Canceled',
  },
};

export type TasksStrings = typeof en;
