import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The app-info + preferences + credentials + adblock/typo/translate/video settings + file-access
 * slice of the preload bridge (~70 methods, one shape). Data-driven pin of channel + payload for the
 * bulk, plus the credential methods that rename `id` → `keyId` and the per-site setters that wrap
 * `(origin, enabled)` into `{ origin, enabled }`.
 */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { settingsMiscApi: api } = await import('./api-settings-misc');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
  ipc.send.mockClear();
});

type Row = [name: string, run: () => unknown, channel: string, payload?: unknown];

const INVOKES: Row[] = [
  ['getAppInfo', () => api.getAppInfo(), IpcChannels.appGetInfo],
  ['copyDiagnostics', () => api.copyDiagnostics(), IpcChannels.appCopyDiagnostics],
  ['openDataFolder', () => api.openDataFolder(), IpcChannels.appOpenDataFolder],
  ['getDefaultBrowserStatus', () => api.getDefaultBrowserStatus(), IpcChannels.defaultBrowserGet],
  ['setAsDefaultBrowser', () => api.setAsDefaultBrowser(), IpcChannels.defaultBrowserSet],
  ['getProcessMetrics', () => api.getProcessMetrics(), IpcChannels.processMetricsGet],
  ['getPreferences', () => api.getPreferences(), IpcChannels.prefsGet],
  ['resetPreferences', () => api.resetPreferences(), IpcChannels.prefsReset],
  ['completeOnboarding', () => api.completeOnboarding(), IpcChannels.onboardingComplete],
  ['getPublicSettings', () => api.getPublicSettings(), IpcChannels.publicSettingsGet],
  ['getCredentialsStatus', () => api.getCredentialsStatus(), IpcChannels.credentialsStatus],
  ['listCredentials', () => api.listCredentials(), IpcChannels.credentialsList],
  ['getUserAgent', () => api.getUserAgent(), IpcChannels.userAgentGet],
  ['refreshAdblockLists', () => api.refreshAdblockLists(), IpcChannels.adblockRefresh],
  ['pickFileAccessFolder', () => api.pickFileAccessFolder(), IpcChannels.fileAccessPickFolder],
  [
    'updatePreferences (bare patch)',
    () => api.updatePreferences({ locale: 'tr' }),
    IpcChannels.prefsSet,
    { locale: 'tr' },
  ],
  [
    'checkTypoText (bare input)',
    () => api.checkTypoText({ text: 'teh' }),
    IpcChannels.typoCheck,
    { text: 'teh' },
  ],
  [
    'downloadTypoDictionary',
    () => api.downloadTypoDictionary('en-US'),
    IpcChannels.typoDictionaryDownload,
    'en-US',
  ],
  [
    'getNewTabBackgroundImage (bare ref)',
    () => api.getNewTabBackgroundImage('ref-1'),
    IpcChannels.newtabGetBackgroundImage,
    'ref-1',
  ],
  [
    'removeTranslateGlossaryTerm (bare id)',
    () => api.removeTranslateGlossaryTerm('t1'),
    IpcChannels.translateGlossaryRemove,
    't1',
  ],
];

const KEYED: Row[] = [
  [
    'addProviderKey → {provider, label, apiKey, region}',
    () => api.addProviderKey('anthropic', 'Work', 'sk-x', 'us'),
    IpcChannels.credentialsAdd,
    { provider: 'anthropic', label: 'Work', apiKey: 'sk-x', region: 'us' },
  ],
  [
    'removeProviderKeyById renames id → keyId',
    () => api.removeProviderKeyById('k1'),
    IpcChannels.credentialsRemoveById,
    { keyId: 'k1' },
  ],
  [
    'renameProviderKey → {keyId, label}',
    () => api.renameProviderKey('k1', 'New'),
    IpcChannels.credentialsRename,
    { keyId: 'k1', label: 'New' },
  ],
  [
    'setProviderKeyModel → {keyId, model}',
    () => api.setProviderKeyModel('k1', 'claude-x'),
    IpcChannels.credentialsSetModel,
    { keyId: 'k1', model: 'claude-x' },
  ],
  [
    'reorderProviderKeys → {orderedIds}',
    () => api.reorderProviderKeys(['a', 'b']),
    IpcChannels.credentialsReorder,
    { orderedIds: ['a', 'b'] },
  ],
];

const SITE_SETTERS: Row[] = [
  [
    'setAdblockSiteEnabled',
    () => api.setAdblockSiteEnabled('https://ex.test', false),
    IpcChannels.adblockSiteSet,
    { origin: 'https://ex.test', enabled: false },
  ],
  [
    'setTypoSiteEnabled',
    () => api.setTypoSiteEnabled('https://ex.test', true),
    IpcChannels.typoSiteSet,
    { origin: 'https://ex.test', enabled: true },
  ],
  [
    'setTranslateSiteEnabled',
    () => api.setTranslateSiteEnabled('https://ex.test', false),
    IpcChannels.translateSiteSet,
    { origin: 'https://ex.test', enabled: false },
  ],
  [
    'setVideoPlayerSiteEnabled',
    () => api.setVideoPlayerSiteEnabled('https://ex.test', true),
    IpcChannels.videoPlayerSiteSet,
    { origin: 'https://ex.test', enabled: true },
  ],
  [
    'addTypoIgnoredWord → {word, language}',
    () => api.addTypoIgnoredWord('teh', 'en'),
    IpcChannels.typoIgnoredWordAdd,
    { word: 'teh', language: 'en' },
  ],
];

describe.each([...INVOKES, ...KEYED, ...SITE_SETTERS])(
  'invoke: %s',
  (_n, run, channel, payload) => {
    it('hits its channel with the right payload', () => {
      run();
      if (payload === undefined) expect(invoke).toHaveBeenCalledWith(channel);
      else expect(invoke).toHaveBeenCalledWith(channel, payload);
    });
  },
);

describe('ipcRenderer.send methods', () => {
  it('endTabProcess / trustPopupOrigin / cancelTypoDictionaryDownload are bare sends', () => {
    api.endTabProcess('t1');
    api.trustPopupOrigin('https://ex.test');
    api.cancelTypoDictionaryDownload('en-US');
    expect(ipc.send.mock.calls).toEqual([
      [IpcChannels.processMetricsEnd, { tabId: 't1' }],
      [IpcChannels.popupBlockerTrust, 'https://ex.test'],
      [IpcChannels.typoDictionaryCancel, 'en-US'],
    ]);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('a representative subscription', () => {
  it('onPublicSettingsChanged forwards the settings and unsubscribes the exact listener', () => {
    const cb = vi.fn();
    const off = api.onPublicSettingsChanged(cb);
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, s: unknown) => void;
    listener({}, { theme: 'dark' });
    expect(cb).toHaveBeenCalledWith({ theme: 'dark' });
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.publicSettingsChanged, listener);
  });
});
