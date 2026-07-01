/** English is the source shape for this extension's own strings; `tr.ts` must match it exactly. */
export const en = {
  title: 'Agent Console',
  progress: 'Progress',
  tokens: 'Tokens',
  noActiveTasks: 'No active tasks',
  awaitingApproval: 'Awaiting your approval',
  open: 'Agent',
  runPlaceholder: 'Tell Tepegöz what to do on this page…',
  run: 'Run',
  running: 'Running…',
  approvalTitle: 'Approval required',
  approvalBody: 'The agent wants to run a tool that changes state. Allow it?',
  biometricNote: 'This is a high-risk action (Windows Hello will be required in a later release).',
  approve: 'Approve',
  deny: 'Deny',
  aiDisclaimer: 'AI-generated and may be wrong — review side-effecting actions.',
  planTitle: 'Review the plan',
  planBody: 'Uncheck any step you do not want, then run. Nothing executes until you approve.',
  planRun: 'Run plan',
  // The agentic command palette (Chat/Do/Make/Tasks) — this extension owns the surface.
  commandPalette: {
    placeholder: 'Type a command or ask Tepegöz…',
    modeChat: 'Chat',
    modeDo: 'Do',
    modeMake: 'Make',
    modeTasks: 'Tasks',
  },
};

export type AgentStrings = typeof en;
