/**
 * English is the PRIMARY / SOURCE locale. Its shape is the contract: every other locale must match
 * it exactly (enforced by the `Resources` type and the catalog-integrity test). No user-facing string
 * is hardcoded in components — it always comes from here.
 */
export const en = {
  common: {
    appName: 'Tepegöz',
    ok: 'OK',
    cancel: 'Cancel',
    retry: 'Retry',
    save: 'Save',
    settings: 'Settings',
  },
  commandPalette: {
    placeholder: 'Type a command or ask Tepegöz…',
    modeChat: 'Chat',
    modeDo: 'Do',
    modeMake: 'Make',
    modeTasks: 'Tasks',
  },
  agentConsole: {
    title: 'Agent Console',
    progress: 'Progress',
    tokens: 'Tokens',
    noActiveTasks: 'No active tasks',
    awaitingApproval: 'Awaiting your approval',
  },
  onboarding: {
    welcome: 'Welcome to Tepegöz',
    consentTitle: 'Your data, your control',
    consentBody: 'Telemetry is off by default. Sensitive sites are locked from automation.',
  },
  errors: {
    unauthorized: 'Authentication required',
    forbidden: 'Action blocked by policy',
    badState: 'Invalid state for this operation',
    upstreamDown: 'Service unavailable',
  },
};

/** Shape contract derived from the English source (values widened to string). */
export type Resources = typeof en;
