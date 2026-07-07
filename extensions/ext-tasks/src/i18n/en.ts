export const en = {
  title: 'Scheduled tasks',
  subtitle: 'Agent chats that run on a schedule or when a page changes.',
  newTask: 'New task',
  newFromConversation: 'From a chat',
  empty: 'No saved tasks yet',
  emptyHint: 'Save an agent chat as a task, or create one from scratch.',
  loading: 'Loading…',
  searchPlaceholder: 'Search tasks',
  noResults: 'No matching tasks',
  none: '—',
  sourceChat: 'From chat',

  columns: {
    name: 'Task',
    schedule: 'Schedule',
    status: 'Status',
    lastRun: 'Last run',
    nextRun: 'Next run',
    actions: 'Actions',
  },

  actions: {
    runNow: 'Run now',
    enable: 'Enable',
    disable: 'Disable',
    edit: 'Edit',
    delete: 'Delete',
    viewChat: 'View chat',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
  },

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

  scheduleSummary: {
    everyMinutes: 'Every {n} min',
    pageChange: 'On page change',
    manual: 'Manual only',
  },

  modal: {
    createTitle: 'New scheduled task',
    editTitle: 'Edit task',
    name: 'Name',
    prompt: 'Instruction',
    promptHint: 'What the agent should do each time this runs.',
    targetUrl: 'Target page (URL)',
    targetUrlHint: 'The page the task opens and works on.',
    nameRequired: 'Give the task a name.',
    promptRequired: 'Add an instruction for the task.',
    invalidUrl: 'Enter a valid URL, including https://.',
    saveFailed: 'Could not save the task.',
    updated: 'Task saved.',
  },

  schedule: {
    label: 'Schedule',
    continuous: 'Continuous',
    continuousHint: 'As often as possible — every 5 minutes.',
    interval: 'On an interval',
    intervalHint: 'Run every few minutes.',
    pageChange: 'When the page changes',
    pageChangeHint: 'Watch the page and run when its content changes.',
    everyMinutes: 'Every (minutes)',
    minInterval: 'Minimum is 5 minutes.',
    selector: 'CSS selector (optional)',
    selectorHint: 'Watch a single element instead of the whole page.',
    changeMode: 'Compare',
    changeModeTextHash: 'Whole page text',
    changeModeElementText: 'Selected element text',
  },

  autonomy: {
    label: 'When it needs to act',
    notify: 'Notify me',
    notifyHint: 'Pause and notify before any action that changes the page.',
    sameOrigin: 'Act on this site',
    sameOriginHint: 'Let it click and type on the target site without asking. Needs a target URL.',
  },

  runs: {
    title: 'Recent runs',
    empty: 'No runs yet',
    allTasks: 'All tasks',
    clearFilter: 'Show all',
  },
  artifacts: {
    title: 'Results',
    empty: 'No results yet',
  },

  picker: {
    title: 'Pick a chat',
    search: 'Search chats',
    empty: 'No chats found',
    turns: 'turns',
    loading: 'Loading…',
  },

  deleteConfirm: 'Delete this task? This cannot be undone.',
};

export type TasksStrings = typeof en;
