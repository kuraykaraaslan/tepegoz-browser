/** English is the source shape for this extension's own strings; `tr.ts` must match it exactly. */
export const en = {
  title: 'User-Agent',
  description:
    'Choose how this browser identifies itself to sites. Pick a preset or paste your own.',
  current: 'Current',
  presets: 'Presets',
  default: 'Default (Tepegöz)',
  custom: 'Custom',
  customPlaceholder: 'Paste a custom User-Agent string…',
  customInUse: 'A custom User-Agent is active.',
  apply: 'Apply',
  active: 'Active',
  reloadNote: 'Changing the User-Agent reloads your open tabs.',
};

export type UserAgentStrings = typeof en;
