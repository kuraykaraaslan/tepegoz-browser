export const en = {
  /** Page + tab title (also used by the main process for the internal-tab title). */
  title: 'Task Manager',
  loading: 'Loading…',
  empty: 'No processes',
  /** Column headers. */
  columns: {
    task: 'Task',
    cpu: 'CPU',
    memory: 'Memory',
    pid: 'Process ID',
  },
  kind: {
    browser: 'Browser',
    gpu: 'GPU process',
    utility: 'Utility',
    tab: 'Tab',
  },
  /** Shown in the PID column for a discarded (sleeping) tab that has no process. */
  noProcess: '—',
  /** Badge on a discarded tab row. */
  discarded: 'Sleeping',
  /** The row that sums every process. */
  total: 'Total',
  /** "End process" action + its confirm. */
  endProcess: 'End process',
  endProcessConfirm: 'End this tab’s process? The page will reload when you return to it.',
  /** aria-label / tooltip for the manual refresh control. */
  refresh: 'Refresh now',
  /** Click-to-sort column headers. `hint` is the header button's tooltip; `ascending` / `descending`
   *  are announced (visually hidden) on the active column alongside the ▲ / ▼ glyph. */
  sort: {
    hint: 'Sort by this column',
    ascending: 'sorted ascending',
    descending: 'sorted descending',
  },
};

export type ProcessStrings = typeof en;
