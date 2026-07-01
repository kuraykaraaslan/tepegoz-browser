/**
 * English is the source shape for this package's own strings; `tr.ts` must match it exactly. The page
 * title is intentionally absent — it reuses the shared-core `common.settings` (no re-translation).
 */
export const en = {
  search: 'Search settings',
  noResults: 'No matching settings',
  providersTitle: 'Providers & API keys',
  providersSubtitle:
    'Keys are encrypted on this device (OS keychain) and never leave it without your action.',
  apiKey: 'API key',
  apiKeyPlaceholder: 'Paste your key…',
  keySet: 'Key set',
  keyNotSet: 'No key',
  remove: 'Remove',
  keySaved: 'Key saved.',
  keyRemoved: 'Key removed.',
  encryptionUnavailable:
    'OS encryption is unavailable — keys cannot be stored securely on this device.',
  providerNames: {
    anthropic: 'Claude (Anthropic)',
    openai: 'OpenAI',
    gemini: 'Gemini (Google)',
  },
  appearanceTitle: 'Appearance',
  theme: 'Theme',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  languageTitle: 'Language',
  langSystem: 'System',
  privacyTitle: 'Privacy & telemetry',
  telemetry: 'Share anonymous usage telemetry',
  telemetryDesc: 'Off by default. No page content or keys are ever sent.',
  costTitle: 'Cost & performance',
  localModel: 'Use a local model for simple tasks',
  localModelDesc:
    'Runs simple steps (classify, summarize) on-device to cut AI cost, falling back to the cloud when needed. The local model activates in a later release.',
};

export type SettingsStrings = typeof en;
