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
  // Human Handoff Controller — shown when a CAPTCHA / 2FA is detected and the agent hands back.
  handoff: {
    notifyTitle: 'Your turn — Tepegöz paused',
    captcha:
      'A CAPTCHA was detected. Tepegöz has stopped and handed control back to you — it will not solve it automatically. Complete it yourself, then start a new task.',
    twofa:
      'A verification step (2FA / one-time code) was detected. Tepegöz has stopped and handed control back to you — finish signing in yourself, then start a new task.',
  },
  // The agentic command palette (Chat/Do/Make/Tasks) — this extension owns the surface.
  commandPalette: {
    placeholder: 'Type a command or ask Tepegöz…',
    modeChat: 'Chat',
    modeDo: 'Do',
    modeMake: 'Make',
    modeTasks: 'Tasks',
  },
  // Timeline replay — scrub a run's event stream to review it step-by-step (live = follow the latest).
  replay: {
    timeline: 'Replay timeline',
    stepLabel: 'Step',
    live: 'Live',
  },
  // Composer / chrome.
  newTask: 'New task',
  send: 'Send',
  stop: 'Stop',
  modelLabel: 'Model',
  // Amber risk banner shown when autonomy is not 'ask' (level-aware).
  risk: {
    actTitle: 'Acting without asking',
    actBody: 'Runs routine steps on its own, but still pauses for destructive or financial actions.',
    autoTitle: 'Fully autonomous',
    autoBody: 'Takes actions on this page and the web without pausing — review the timeline.',
  },
  // Graduated autonomy levels (the composer dropdown).
  autonomy: {
    ask: { title: 'Ask before acting', desc: 'Reviews the plan and each state-changing step.' },
    act: {
      title: 'Act without asking',
      desc: 'Runs routine steps; still asks for destructive or financial actions.',
    },
    auto: { title: 'Auto', desc: 'Fully autonomous — takes actions without pausing.' },
    dangerous: { title: 'Dangerous', desc: 'Coming soon — unrestricted mode with no safety gates.' },
  },
  // Reasoning-effort presets (the composer effort dropdown). Higher effort → deeper reasoning + more tokens.
  effort: {
    title: 'Effort',
    low: { title: 'Low', desc: 'Fastest and cheapest — brief reasoning.' },
    medium: { title: 'Medium', desc: 'Balanced reasoning and cost.' },
    high: { title: 'High', desc: 'Deeper reasoning (default).' },
    xhigh: { title: 'Very high', desc: 'Extended reasoning, longer answers.' },
    max: { title: 'Max', desc: 'Maximum reasoning and token budget.' },
  },
  // Collapsible reasoning section (the agent's plan goal + per-step rationale).
  reasoning: {
    title: 'Reasoning',
    show: 'Show',
    hide: 'Hide',
  },
  // Copy button on markdown code blocks.
  copy: 'Copy',
  // Chat thread — each turn is the user's message followed by the agent's response.
  thread: {
    you: 'You',
    working: 'Working…',
  },
};

export type AgentStrings = typeof en;
