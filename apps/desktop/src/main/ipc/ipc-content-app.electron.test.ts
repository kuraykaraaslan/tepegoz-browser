import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registerAppIpc` — app-info / preferences / public-settings / onboarding / MCP / adaptors /
 * extensions / credentials IPC. Pinned: the read handlers delegate (appGetInfo, prefsGet,
 * publicSettingsGet, mcpGetStatus, credentialsStatus/List); diagnostics composes AND copies;
 * appOpen* map shell.openPath's error string to a boolean; prefsReset merges the defaults and
 * reconciles every downstream service; onboardingComplete resolves the sender window;
 * extensionsListManifests strips mcpServer; and the credential mutations validate the payload,
 * drive the vault, and keep defaultProvider synced to the top key (credentialsSetModel 404s an
 * unknown key + rejects an off-catalog model).
 */

const helpers = vi.hoisted(() => ({ h: new Map<string, (e: unknown, p: unknown) => unknown>() }));
vi.mock('./ipc-helpers', () => ({
  handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => helpers.h.set(c, fn),
}));

const shell = vi.hoisted(() => ({ openPath: vi.fn(() => Promise.resolve('')) }));
const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));
const browserWindow = vi.hoisted(() => ({
  fromWebContents: vi.fn((): unknown => ({ __win: true })),
  getAllWindows: () => [],
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/userData' },
  BrowserWindow: browserWindow,
  clipboard,
  shell,
  webContents: {},
}));

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { warn: vi.fn() } }));

const CH = {
  appGetInfo: 'app:getInfo',
  appCopyDiagnostics: 'app:copyDiag',
  appOpenThirdPartyNotices: 'app:openTpn',
  appOpenDataFolder: 'app:openData',
  defaultBrowserGet: 'db:get',
  defaultBrowserSet: 'db:set',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  publicSettingsGet: 'pub:get',
  prefsReset: 'prefs:reset',
  onboardingComplete: 'onboard:done',
  mcpGetStatus: 'mcp:status',
  adaptorsList: 'adaptors:list',
  aiAdaptorsList: 'aiAdaptors:list',
  extensionsListManifests: 'ext:manifests',
  credentialsStatus: 'cred:status',
  credentialsList: 'cred:list',
  credentialsAdd: 'cred:add',
  credentialsRemoveById: 'cred:removeById',
  credentialsRename: 'cred:rename',
  credentialsSetModel: 'cred:setModel',
  credentialsReorder: 'cred:reorder',
};
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels: CH }));
vi.mock('@tepegoz/desktop-ipc/schemas', () => ({
  AddProviderKeyInputSchema: { parse: (x: unknown) => x },
  AppInfoSchema: { parse: (x: unknown) => x },
  RemoveKeyByIdSchema: { parse: (x: unknown) => x },
  RenameProviderKeyInputSchema: { parse: (x: unknown) => x },
  ReorderKeysSchema: { parse: (x: unknown) => x },
  SetProviderKeyModelSchema: { parse: (x: unknown) => x },
}));

vi.mock('@tepegoz/model-gateway', () => ({
  PROVIDER_MODEL_CATALOG: { anthropic: [{ id: 'claude-x', label: 'X' }] },
  providerRegions: vi.fn(() => [{ id: 'eu', label: 'EU' }]),
}));
vi.mock('@tepegoz/shared-types', () => ({ AI_PROVIDERS: ['anthropic', 'openai'] }));

const mcp = vi.hoisted(() => ({
  getStatus: vi.fn(() => [{ id: 's1' }]),
  reconcile: vi.fn(() => Promise.resolve()),
}));
vi.mock('../mcp/supervisor.electron', () => ({ default: mcp }));
const extCaps = vi.hoisted(() => ({ reconcile: vi.fn() }));
vi.mock('../extensions/capability-supervisor.electron', () => ({ default: extCaps }));
vi.mock('../file-operations/file-operations-host', () => ({ default: {} }));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ defaultProvider: 'anthropic' })),
  update: vi.fn((p: unknown) => ({ merged: true, ...(p as object) })),
}));
vi.mock('@tepegoz/preferences', () => ({
  default: prefs,
  DEFAULT_PREFERENCES: { __defaults: true },
  PreferencesPatchSchema: { parse: (x: unknown) => x },
}));

vi.mock('../lib/i18n-main', () => ({ mainLocale: () => 'en' }));
vi.mock('../lib/app-info', () => ({
  buildAppInfo: () => ({ version: '1.0.0' }),
  diagnosticsText: () => 'DIAG BLOCK',
  thirdPartyNoticesPath: vi.fn(() => '/notices.html'),
}));
vi.mock('../site-zoom', () => ({ reapplyZoomEverywhere: vi.fn() }));
vi.mock('../agent/ai-adaptors', () => ({
  buildAdaptorConnections: () => [{ id: 'a1' }],
  buildAiAdaptors: () => [{ id: 'ai1' }],
}));
const publicSettings = vi.hoisted(() => ({
  getPublicSettings: vi.fn(() => ({ theme: 'dark' })),
  broadcastPublicSettings: vi.fn(),
}));
vi.mock('../settings/public-settings-host', () => publicSettings);

const vault = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  status: vi.fn(() => ({ anthropic: true })),
  listMeta: vi.fn(() => [{ id: 'k1', provider: 'anthropic', label: 'work' }]),
  topProvider: vi.fn(() => 'anthropic'),
  addKey: vi.fn(),
  removeKey: vi.fn(),
  renameKey: vi.fn(),
  setKeyModel: vi.fn(),
  reorderKeys: vi.fn(),
}));
vi.mock('@tepegoz/credential-vault', () => ({ default: vault }));

const completeOnboarding = vi.hoisted(() => vi.fn());
vi.mock('../browser-windows', () => ({ completeOnboarding }));
const adblockHost = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('../extensions/adblock-host.electron', () => ({ default: adblockHost }));
const typoHost = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('../extensions/typo-host.electron', () => ({ default: typoHost }));
const translateHost = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('../extensions/translate-host.electron', () => ({ default: translateHost }));
vi.mock('../../shared/extensions', () => ({
  builtinManifests: () => [
    {
      id: 'e1',
      name: 'E1',
      version: '1',
      description: 'd',
      icon: 'i',
      surfaces: [],
      actions: [],
      labels: {},
      permissions: [],
      mcpServer: { SECRET: true },
    },
  ],
}));
vi.mock('../lib/glass', () => ({ applyChromeGlass: vi.fn(), isMicaSupported: () => false }));
vi.mock('../lib/surface-theme', () => ({ resolveSurfaceTheme: () => ({ theme: 'dark' }) }));
vi.mock('../launch-at-login', () => ({ setLaunchAtLogin: vi.fn() }));
const defaultBrowser = vi.hoisted(() => ({
  getDefaultBrowserStatus: vi.fn(() => ({ isDefault: false })),
  setAsDefaultBrowser: vi.fn(() => ({ isDefault: true })),
}));
vi.mock('../default-browser', () => defaultBrowser);
vi.mock('../tray', () => ({ refreshTray: vi.fn() }));
vi.mock('../menus/application-menu', () => ({ refreshApplicationMenu: vi.fn() }));

const { registerAppIpc } = await import('./ipc-content-app');
const call = (c: string, p?: unknown) => helpers.h.get(c)!({ sender: {} }, p);

beforeEach(() => {
  vi.clearAllMocks();
  helpers.h.clear();
  prefs.getAll.mockReturnValue({ defaultProvider: 'anthropic' });
  prefs.update.mockImplementation((p: unknown) => ({ merged: true, ...(p as object) }));
  vault.topProvider.mockReturnValue('anthropic');
  vault.listMeta.mockReturnValue([{ id: 'k1', provider: 'anthropic', label: 'work' }]);
  browserWindow.fromWebContents.mockReturnValue({ __win: true });
  registerAppIpc();
});

describe('the read handlers', () => {
  it('delegate to their source', () => {
    expect(call(CH.appGetInfo)).toEqual({ version: '1.0.0' });
    expect(call(CH.prefsGet)).toEqual({ defaultProvider: 'anthropic' });
    expect(call(CH.publicSettingsGet)).toEqual({ theme: 'dark' });
    expect(call(CH.mcpGetStatus)).toEqual([{ id: 's1' }]);
    expect(call(CH.credentialsList)).toEqual([{ id: 'k1', provider: 'anthropic', label: 'work' }]);
    expect(call(CH.defaultBrowserGet)).toEqual({ isDefault: false });
    expect(call(CH.defaultBrowserSet)).toEqual({ isDefault: true });
  });
});

it('appCopyDiagnostics composes the block AND writes it to the clipboard', () => {
  expect(call(CH.appCopyDiagnostics)).toBe('DIAG BLOCK');
  expect(clipboard.writeText).toHaveBeenCalledWith('DIAG BLOCK');
});

describe('appOpen* map the openPath error string to a boolean', () => {
  it('empty error → true, non-empty → false, missing notices file → false', async () => {
    expect(await call(CH.appOpenDataFolder)).toBe(true);
    shell.openPath.mockResolvedValueOnce('EACCES');
    expect(await call(CH.appOpenThirdPartyNotices)).toBe(false);
  });
});

it('extensionsListManifests strips mcpServer', () => {
  const [m] = call(CH.extensionsListManifests) as Record<string, unknown>[];
  expect(m).not.toHaveProperty('mcpServer');
  expect(m).toMatchObject({ id: 'e1', permissions: [] });
});

describe('prefsSet / prefsReset', () => {
  it('prefsSet validates then merges the patch', () => {
    call(CH.prefsSet, { theme: 'light' });
    expect(prefs.update).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('prefsReset merges the full defaults and reconciles every downstream service', () => {
    call(CH.prefsReset);
    expect(prefs.update).toHaveBeenCalledWith({ __defaults: true });
    expect(mcp.reconcile).toHaveBeenCalled();
    expect(extCaps.reconcile).toHaveBeenCalled();
    expect(adblockHost.init).toHaveBeenCalled();
    expect(typoHost.init).toHaveBeenCalled();
    expect(translateHost.init).toHaveBeenCalled();
    expect(publicSettings.broadcastPublicSettings).toHaveBeenCalled();
  });
});

it('onboardingComplete resolves the sender window then finishes onboarding', () => {
  call(CH.onboardingComplete);
  expect(completeOnboarding).toHaveBeenCalledWith({ __win: true });

  browserWindow.fromWebContents.mockReturnValue(null);
  completeOnboarding.mockClear();
  call(CH.onboardingComplete);
  expect(completeOnboarding).not.toHaveBeenCalled();
});

describe('the credential mutations', () => {
  it('credentialsAdd validates the region, adds the key and syncs the default provider', () => {
    prefs.getAll.mockReturnValue({ defaultProvider: 'openai' }); // differs → update fires
    call(CH.credentialsAdd, { provider: 'anthropic', label: 'l', apiKey: 'sk', region: 'eu' });
    expect(vault.addKey).toHaveBeenCalledWith('anthropic', 'l', 'sk', 'eu');
    expect(prefs.update).toHaveBeenCalledWith({ defaultProvider: 'anthropic' });
    expect(publicSettings.broadcastPublicSettings).toHaveBeenCalled();
  });

  it('credentialsAdd drops an unknown region to the default endpoint', () => {
    call(CH.credentialsAdd, { provider: 'anthropic', label: 'l', apiKey: 'sk', region: 'mars' });
    expect(vault.addKey).toHaveBeenCalledWith('anthropic', 'l', 'sk', undefined);
  });

  it('credentialsRemoveById / Rename / Reorder drive the vault', () => {
    call(CH.credentialsRemoveById, { keyId: 'k1' });
    call(CH.credentialsRename, { keyId: 'k1', label: 'new' });
    call(CH.credentialsReorder, { orderedIds: ['k2', 'k1'] });
    expect(vault.removeKey).toHaveBeenCalledWith('k1');
    expect(vault.renameKey).toHaveBeenCalledWith('k1', 'new');
    expect(vault.reorderKeys).toHaveBeenCalledWith(['k2', 'k1']);
  });

  it('credentialsSetModel 404s an unknown key and rejects an off-catalog model', () => {
    expect(() => call(CH.credentialsSetModel, { keyId: 'ghost', model: 'x' })).toThrow(
      expect.objectContaining({ statusCode: 404, code: 'keyNotFound' }) as Error,
    );
    expect(() => call(CH.credentialsSetModel, { keyId: 'k1', model: 'not-in-catalog' })).toThrow(
      expect.objectContaining({ statusCode: 400 }) as Error,
    );
    call(CH.credentialsSetModel, { keyId: 'k1', model: 'claude-x' });
    expect(vault.setKeyModel).toHaveBeenCalledWith('k1', 'claude-x');
  });
});
