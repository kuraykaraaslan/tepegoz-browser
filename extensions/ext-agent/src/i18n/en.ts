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
  runFailed: 'Agent run failed before it could start.',
  approvalTitle: 'Approval required',
  approvalBody: 'The agent wants to run a tool that changes state. Allow it?',
  biometricNote: 'This is a high-risk action (Windows Hello will be required in a later release).',
  // Risk classes (S6-PR2). The class is derived in the main process from the tool AND its actual
  // arguments, so the prompt can name what kind of act is being asked for. A flat "a tool wants to
  // change state" trains people to click through; naming the act is what keeps consent meaningful.
  riskClass: {
    label: 'Risk class',
    read: {
      name: 'Read',
      desc: 'Reads page content only. Nothing is changed or sent anywhere.',
    },
    'ui-write': {
      name: 'Page change',
      desc: 'Changes something on the page or in the app. Reversible, nothing sensitive.',
    },
    'data-egress': {
      name: 'Data leaves',
      desc: 'Sends data off this device or to another site. Check where it is going.',
    },
    financial: {
      name: 'Money',
      desc: 'Involves a payment or a financial account. Money can move.',
    },
    credential: {
      name: 'Secret',
      desc: 'Involves a password, one-time code, or card details.',
    },
    destructive: {
      name: 'Irreversible',
      desc: 'Deletes or overwrites data. This cannot be undone.',
    },
  },
  // Why a site is locked out of automation, by category (sensitive-site lockout).
  sensitiveSite: {
    banking: 'This looks like a banking or payments site.',
    government: 'This looks like a government service.',
    crypto: 'This looks like a crypto exchange or wallet.',
    'password-manager': 'This looks like a password manager.',
    health: 'This looks like a health or medical service.',
  },
  approve: 'Approve',
  deny: 'Deny',
  planTitle: 'Review the plan',
  planBody: 'Uncheck any step you do not want, then run. Nothing executes until you approve.',
  planRun: 'Run plan',
  // Human Handoff Controller — shown when a CAPTCHA / 2FA / login wall is detected and the agent hands back.
  handoff: {
    notifyTitle: 'Your turn — Tepegöz paused',
    captcha:
      'A CAPTCHA was detected. Tepegöz has stopped and handed control back to you — it will not solve it automatically. Complete it yourself, then start a new task.',
    twofa:
      'A verification step (2FA / one-time code) was detected. Tepegöz has stopped and handed control back to you — finish signing in yourself, then start a new task.',
    login:
      'A login screen was detected. Tepegöz has paused and will not sign in for you. Log in on the page, then press Resume — it will continue the task from there.',
  },
  // Token Ledger quota — the 80% warning (raised once when cumulative usage crosses the threshold).
  quota: {
    warnTitle: 'Approaching your token quota',
    warnBody: 'This account has used over 80% of its token quota. Adjust it in Settings → Agent.',
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
  history: {
    label: 'Conversation history',
    search: 'Search conversations...',
    empty: 'No conversations yet',
    loading: 'Loading...',
    full: 'Full conversation history',
    delete: 'Delete conversation',
  },
  // Skills library (S9): stored prompt TEMPLATES. Picking one fills the composer — it never starts a
  // run, so the wording says 'use', not 'run'. Never promise the user autonomy they did not grant.
  skills: {
    label: 'Skills',
    title: 'Saved prompts you can reuse',
    empty: 'No saved skills yet',
    loading: 'Loading...',
    save: 'Save this prompt as a skill',
    saveTitle: 'Name this skill',
    namePlaceholder: 'Weekly invoice check',
    startUrl: 'Starts at',
    grantProfile: 'Expects',
    hint: 'Picking a skill fills the box below and opens its start page. Nothing runs until you press send.',
    delete: 'Remove skill',
    saveEmpty: 'Type a prompt first, then save it as a skill.',
  },
  // Remembered grants (S9). Only a named SKILL can hold one, so every string names the skill: a
  // permission the user cannot point at is one they cannot revoke. {skill} and {days} are filled in
  // by the caller — placeholders, not concatenation, because Turkish puts them in a different order.
  grants: {
    remember: 'Remember this for “{skill}”',
    rememberHint: 'Only this site and this kind of action, for {days} days. Deleting the skill undoes it.',
    remembered: 'Saved this permission for “{skill}”.',
    used: 'Allowed by a permission you saved for “{skill}”.',
  },
  // Commerce gate (S8 PR6). A purchase is the one approval where a reflex click is expensive and
  // irreversible, so it asks for a second, deliberate gesture — and says WHY, once, without blocking.
  commerce: {
    confirm: 'I understand this can spend money',
    caution: 'Automated purchasing is contested legally (Amazon v. Perplexity). Some sites prohibit it in their terms — check before you rely on it.',
  },
  // Scope granted at an approval (S8). The wording names the SITE and the run, because a permission
  // whose edges the user cannot see is one they cannot judge.
  scope: {
    grant: 'Allow this on {host} for the rest of this task',
    hint: 'Only this site and this kind of action, and only until this task ends. Money, passwords and deletions always ask.',
  },
  // What approving a plan actually buys — stated on the modal, because an approval whose consequences
  // are invisible is not informed consent.
  planGrant: 'Approving covers the routine steps of this plan on the sites it names, for this task only. Money, passwords and deletions still ask every time.',
  // Backgroundable run (S8 PR5). The window goes away; the task does not — and the tray says so.
  background: 'Continue in the background',
  historyPage: {
    title: 'Agent history',
    search: 'Search conversations',
    empty: 'No conversations yet',
    loading: 'Loading...',
    clear: 'Clear all',
    delete: 'Remove',
    openInPanel: 'Open in panel',
    turns: 'turns',
    detailEmpty: 'Select a conversation to preview it.',
  },
  send: 'Send',
  stop: 'Stop',
  pause: 'Pause',
  resume: 'Resume',
  steer: 'Send instruction (folds into the running task)',
  steerPlaceholder: 'Add an instruction while it works…',
  paused: 'Paused',
  modelLabel: 'Model',
  noModels: 'No model available',
  // The composer's run-config popover (gear icon): provider · model · autonomy · effort, each its own row.
  config: 'Config',
  provider: 'Provider',
  // The Model dropdown's "no pin" option — the run auto-routes per task (planning/exec/classify tiers).
  modelAuto: 'Auto',
  autonomyLabel: 'Autonomy',
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
  // S6: the hardened inbound guard toggle. Off by default — a browsing agent legitimately needs to read
  // most page data, so this trades some capability for a smaller inbound surface.
  strictGuard: {
    title: 'Hardened reading',
    desc: 'Strip personal data out of pages before the agent reads them. Safer, but it may hide details a task needs.',
    on: 'On',
    off: 'Off',
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
  // Composer attachment chips (selected text / file / screenshot).
  attach: {
    selection: 'Selected text',
    file: 'File',
    screenshot: 'Screenshot',
    removeLabel: 'Remove attachment',
    selectionEmpty: 'No text is selected on the page.',
    addSelection: 'Attach selected text',
    addFile: 'Attach file',
    addScreenshot: 'Attach screenshot',
    lines: 'lines',
  },
  // "Save as scheduled task" — convert this chat into a recurring task (see the Scheduled Tasks extension).
  scheduleTask: {
    action: 'Save as task',
    title: 'Save as scheduled task',
    desc: 'Run this chat automatically on a schedule or when the page changes.',
    name: 'Name',
    instruction: 'Instruction',
    instructionHint: 'What the agent should do each time this runs.',
    targetUrl: 'Target page (URL)',
    schedule: 'Schedule',
    presetContinuous: 'Continuous (every 5 min)',
    presetInterval: 'On an interval',
    presetPageChange: 'When the page changes',
    everyMinutes: 'Every (minutes)',
    minInterval: 'Minimum is 5 minutes.',
    autonomy: 'When it needs to act',
    autonomyNotify: 'Notify me',
    autonomySameOrigin: 'Act on this site',
    save: 'Save task',
    cancel: 'Cancel',
    nameRequired: 'Give the task a name.',
    instructionRequired: 'Add an instruction for the task.',
    saveFailed: 'Could not save the task.',
    saved: '✓ Task saved',
    openManager: 'Open tasks',
  },
  // Export a full diagnostic bundle to the ~/tepegoz folder (the header star) — chat transcript plus
  // per-tab DOM/PNG snapshots, memory, journal, and a manifest, for analysing an agent run.
  exportLog: {
    action: 'Save diagnostic bundle to tepegoz',
    saved: '✓ Bundle saved',
    failed: 'Could not save the diagnostic bundle.',
  },
};

export type AgentStrings = typeof en;
