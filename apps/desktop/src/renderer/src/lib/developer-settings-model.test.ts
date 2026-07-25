import { describe, expect, it } from 'vitest';
import type { Preferences } from '@tepegoz/desktop-ipc';
import {
  buildBooleanPreferencePatch,
  buildJsonPreferencePatch,
  listDeveloperPreferenceRows,
} from './developer-settings-model';

const PREFS: Preferences = {
  theme: 'system',
  themeColor: '',
  locale: 'system',
  telemetryEnabled: false,
  useLocalModelForSimpleTasks: false,
  localProvider: { mode: 'off', selectedModelId: '' },
  localActions: {},
  agentProviderOverride: null,
  agentModelOverride: {},
  agentAutonomy: 'ask',
  agentEffort: 'high',
  agentTokenQuota: 0,
  defaultProvider: 'anthropic',
  region: '',
  dateFormat: 'medium',
  searchEngineId: 'google',
  onboardingCompleted: false,
  customSearchEngines: [],
  homepageUrl: 'https://duckduckgo.com/',
  showBookmarksBar: true,
  newTabShortcuts: [],
  newTabBackground: {
    kind: 'default',
    color: '#1e293b',
    svgId: '',
    imageRef: '',
    imageFit: 'cover',
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
    opacity: 1,
  },
  downloadDirectory: '',
  downloadAskEachTime: false,
  extensions: [],
  userAgent: null,
  mcpServers: [],
  notificationsEnabled: true,
  sitePermissions: {},
  popupBlocker: { enabled: true, showNotifications: true, trustedOrigins: [] },
  adblock: {
    enabled: true,
    blockingMode: 'ads-and-trackers',
    cosmeticFiltering: true,
    disabledOrigins: [],
  },
  typo: {
    enabled: true,
    autoDetectLanguage: true,
    languages: ['tr', 'en'],
    defaultLanguage: 'tr',
    localLlmMode: 'auto',
    externalAiMode: 'manual',
    disabledOrigins: [],
    ignoredWords: [],
  },
  translate: {
    enabled: true,
    autoTranslateForeignPages: true,
    targetLanguageMode: 'app-locale',
    displayMode: 'replace',
    engineMode: 'local-first',
    cloudFallbackMode: 'ask',
    disabledOrigins: [],
    glossaryTerms: [],
  },
  videoPlayer: {
    enabled: true,
    defaultSpeed: 1,
    subtitleFontSize: 'md',
    theme: 'auto',
    autoHideControls: true,
    enableKeyboard: true,
    disabledOrigins: [],
    siteScales: { 'https://www.youtube.com': 1.4 },
  },
  popupBlockerSeeded: false,
  fileOperationsEnabled: true,
  fileAccessGrants: [],
  fileAccessSeeded: false,
  glassChrome: true,
  windowBounds: null,
  closeToTray: true,
  keepAwakeInTray: false,
  pauseTasksOnSleep: true,
  startupMode: 'window',
  kioskUrl: '',
  launchAtLogin: false,
  trayHintShown: false,
};

describe('developer settings model', () => {
  it('lists every top-level preference key without pseudo flags', () => {
    const keys = listDeveloperPreferenceRows(PREFS)
      .map((row) => row.key)
      .sort();

    expect(keys).toEqual(Object.keys(PREFS).sort());
    expect(keys).not.toContain('developerFlags');
  });

  it('builds boolean preference patches', () => {
    expect(buildBooleanPreferencePatch('onboardingCompleted', true)).toEqual({
      onboardingCompleted: true,
    });
  });

  it('builds JSON preference patches from valid JSON', () => {
    expect(buildJsonPreferencePatch('mcpServers', '[]', 'Invalid JSON')).toEqual({
      ok: true,
      patch: { mcpServers: [] },
    });
  });

  it('rejects invalid JSON drafts', () => {
    expect(buildJsonPreferencePatch('mcpServers', '[', 'Invalid JSON')).toEqual({
      ok: false,
      error: 'Invalid JSON',
    });
  });
});
