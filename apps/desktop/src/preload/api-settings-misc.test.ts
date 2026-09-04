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
  ['setUserAgent', () => api.setUserAgent('UA/1'), IpcChannels.userAgentSet, 'UA/1'],
  ['getPopupBlockerSettings', () => api.getPopupBlockerSettings(), IpcChannels.popupBlockerGet],
  [
    'setPopupBlockerSettings (bare patch)',
    () => api.setPopupBlockerSettings({ enabled: true }),
    IpcChannels.popupBlockerSet,
    { enabled: true },
  ],
  ['getRecentRequests', () => api.getRecentRequests(), IpcChannels.popupBlockerRecentRequests],
  ['getAdblockSettings', () => api.getAdblockSettings(), IpcChannels.adblockGet],
  [
    'setAdblockSettings (bare patch)',
    () => api.setAdblockSettings({ enabled: false }),
    IpcChannels.adblockSet,
    { enabled: false },
  ],
  ['getAdblockState', () => api.getAdblockState(), IpcChannels.adblockState],
  ['getTypoSettings', () => api.getTypoSettings(), IpcChannels.typoGet],
  [
    'setTypoSettings (bare patch)',
    () => api.setTypoSettings({ enabled: true }),
    IpcChannels.typoSet,
    { enabled: true },
  ],
  ['getTypoState', () => api.getTypoState(), IpcChannels.typoState],
  ['listTypoDictionaries', () => api.listTypoDictionaries(), IpcChannels.typoDictionariesList],
  [
    'deleteTypoDictionary',
    () => api.deleteTypoDictionary('en-US'),
    IpcChannels.typoDictionaryDelete,
    'en-US',
  ],
  [
    'showTypoDictionariesFolder',
    () => api.showTypoDictionariesFolder(),
    IpcChannels.typoDictionaryShowFolder,
  ],
  ['getTranslateSettings', () => api.getTranslateSettings(), IpcChannels.translateGet],
  [
    'setTranslateSettings (bare patch)',
    () => api.setTranslateSettings({ enabled: true }),
    IpcChannels.translateSet,
    { enabled: true },
  ],
  ['getTranslateState', () => api.getTranslateState(), IpcChannels.translateState],
  [
    'translateText (bare input)',
    () => api.translateText({ text: 'hi', target: 'tr' } as never),
    IpcChannels.translateText,
    { text: 'hi', target: 'tr' },
  ],
  ['startPageTranslation', () => api.startPageTranslation(), IpcChannels.translatePageStart],
  ['restorePageOriginal', () => api.restorePageOriginal(), IpcChannels.translatePageRestore],
  [
    'addTranslateGlossaryTerm (bare term)',
    () => api.addTranslateGlossaryTerm({ source: 'a', target: 'b' } as never),
    IpcChannels.translateGlossaryAdd,
    { source: 'a', target: 'b' },
  ],
  ['getVideoPlayerSettings', () => api.getVideoPlayerSettings(), IpcChannels.videoPlayerGet],
  [
    'setVideoPlayerSettings (bare patch)',
    () => api.setVideoPlayerSettings({ enabled: true }),
    IpcChannels.videoPlayerSet,
    { enabled: true },
  ],
  ['getVideoPlayerState', () => api.getVideoPlayerState(), IpcChannels.videoPlayerState],
  [
    'pickNewTabBackgroundImage',
    () => api.pickNewTabBackgroundImage(),
    IpcChannels.newtabPickBackgroundImage,
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
  it('endTabProcess / trustPopupOrigin / cancelTypoDictionaryDownload / respondTranslateCloudFallback are bare sends', () => {
    api.endTabProcess('t1');
    api.trustPopupOrigin('https://ex.test');
    api.cancelTypoDictionaryDownload('en-US');
    api.respondTranslateCloudFallback({ requestId: 'r1', approved: true } as never);
    expect(ipc.send.mock.calls).toEqual([
      [IpcChannels.processMetricsEnd, { tabId: 't1' }],
      [IpcChannels.popupBlockerTrust, 'https://ex.test'],
      [IpcChannels.typoDictionaryCancel, 'en-US'],
      [IpcChannels.translateCloudFallbackRespond, { requestId: 'r1', approved: true }],
    ]);
    expect(invoke).not.toHaveBeenCalled();
  });
});

type SubRow = [name: string, run: (cb: (p: unknown) => void) => () => void, channel: string, sample: unknown];
const SUBSCRIPTIONS: SubRow[] = [
  ['onPublicSettingsChanged', (cb) => api.onPublicSettingsChanged(cb), IpcChannels.publicSettingsChanged, { theme: 'dark' }],
  ['onTypoDictionariesState', (cb) => api.onTypoDictionariesState(cb), IpcChannels.typoDictionariesState, [{ id: 'en-US' }]],
  ['onTranslatePageState', (cb) => api.onTranslatePageState(cb), IpcChannels.translatePageState, { status: 'translated' }],
  ['onTranslateCloudFallbackRequest', (cb) => api.onTranslateCloudFallbackRequest(cb), IpcChannels.translateCloudFallbackRequest, { requestId: 'r1' }],
  ['onVideoPlayerPageState', (cb) => api.onVideoPlayerPageState(cb), IpcChannels.videoPlayerPageState, { playing: true }],
];

describe('subscriptions: subscribe, forward only the payload, unsubscribe the exact listener', () => {
  it.each(SUBSCRIPTIONS)('%s', (_n, run, channel, sample) => {
    const cb = vi.fn();
    const off = run(cb);
    expect(ipc.on).toHaveBeenCalledWith(channel, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, p: unknown) => void;
    listener({ senderId: 1 }, sample);
    expect(cb).toHaveBeenCalledWith(sample);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(channel, listener);
  });
});
