import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `translate-host.electron` — the main-process wiring behind `createTranslateHost`, plus the page-state
 * / cloud-fallback bridge. Pinned: each adapter closure routes correctly (prefs get/set, the
 * extension gate with the translate id, resolved locale, local-model availability, the empty-origin
 * short-circuit on the sensitivity check, and the JSON-backed translation memory); `runLocalBatch` /
 * `runCloudBatch` throw a 503 when unavailable and otherwise register the local / vault-resolved
 * external provider and complete through the model gateway; `translateText` delegates to the host;
 * `setTranslatePageState` forwards + broadcasts; and a native cloud-fallback request broadcasts +
 * resolves the OS dialog answer (settled by `respondTranslateCloudFallback` otherwise).
 */

type Opts = {
  getPersisted: () => unknown;
  setPersisted: (v: unknown) => void;
  isExtensionEnabled: () => boolean;
  getResolvedLocale: () => string;
  localAvailable: () => boolean;
  isSensitiveOrigin: (o: string) => boolean;
  runLocalBatch: (i: unknown) => Promise<unknown>;
  runCloudBatch: (i: unknown) => Promise<unknown>;
  requestCloudFallback: (r: {
    requestId: string;
    origin: string;
    targetLanguage: string;
    textCharCount: number;
  }) => Promise<unknown>;
  memoryLookup: (k: string) => string | null;
  memoryStore: (k: string, v: string) => void;
};

const cap = vi.hoisted(
  (): {
    opts?: Opts;
    host: { translateText: ReturnType<typeof vi.fn>; setPageState: ReturnType<typeof vi.fn> };
  } => ({
    host: { translateText: vi.fn(() => Promise.resolve({ ok: true })), setPageState: vi.fn() },
  }),
);
vi.mock('@tepegoz/ext-translate/host', () => ({
  TRANSLATE_EXTENSION_ID: 'ext-translate',
  createTranslateHost: (opts: Opts) => {
    cap.opts = opts;
    return cap.host;
  },
}));
const parseModel = vi.hoisted(() =>
  vi.fn(() => ({ items: [{ id: '1', translatedText: 'merhaba' }] })),
);
vi.mock('@tepegoz/ext-translate/engine', () => ({ parseTranslateModelResponse: parseModel }));

const store = vi.hoisted(() => ({
  readJsonFile: vi.fn((): unknown => undefined),
  writeJsonFile: vi.fn(),
}));
vi.mock('@tepegoz/json-store', () => store);

const gateway = vi.hoisted(() => ({
  register: vi.fn(),
  complete: vi.fn<(req: unknown) => Promise<{ text: string }>>(() => Promise.resolve({ text: '{}' })),
}));
vi.mock('@tepegoz/model-gateway', () => ({
  ModelGateway: gateway,
  resolveProviderBaseURL: () => '',
  AnthropicProvider: class {},
  DeepSeekProvider: class {},
  GeminiProvider: class {},
  GroqProvider: class {},
  KimiProvider: class {},
  NovaProvider: class {},
  OpenAIProvider: class {},
  XaiProvider: class {},
  ANTHROPIC_MODEL: { classify: 'a' },
  OPENAI_MODEL: { classify: 'o' },
  GEMINI_MODEL: { classify: 'g' },
  GROQ_MODEL: { classify: 'q' },
  KIMI_MODEL: { classify: 'k' },
  NOVA_MODEL: { classify: 'n' },
  DEEPSEEK_MODEL: { classify: 'd' },
  XAI_MODEL: { classify: 'x' },
  LOCAL_MODEL: { classify: 'l' },
}));
vi.mock('@tepegoz/local-inference', () => ({ LocalProvider: class {} }));

const isExtensionEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/desktop-ipc', () => ({
  isExtensionEnabled,
  IpcChannels: {
    translatePageState: 'translate:page-state',
    translateCloudFallbackRequest: 'translate:cloud-req',
  },
}));

const isSensitiveSite = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/security-policy', () => ({ isSensitiveSite }));
const isRunnableProvider = vi.hoisted(() => vi.fn(() => false));
vi.mock('@tepegoz/shared-types', () => ({ isRunnableProvider }));

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError }));

const vault = vi.hoisted(() => ({
  listMeta: vi.fn((): unknown[] => []),
  getFirstKeyForProvider: vi.fn((): string | null => null),
}));
vi.mock('@tepegoz/credential-vault', () => ({ default: vault }));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ translate: { mode: 'auto' }, extensions: [{ id: 'ext-translate' }] })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const bw = vi.hoisted(() => ({
  getAllWindows: vi.fn((): unknown[] => []),
  getFocusedWindow: vi.fn((): unknown => null),
}));
const dialog = vi.hoisted(() => ({
  showMessageBox: vi.fn(() => new Promise<never>(() => undefined)),
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/userData' },
  BrowserWindow: bw,
  dialog,
}));

const llama = vi.hoisted(() =>
  vi.fn<() => { isAvailable: () => boolean }>(() => ({ isAvailable: () => false })),
);
vi.mock('../local-inference/llama-engine.electron', () => ({ llamaEngine: llama }));
const modelManager = vi.hoisted(() => ({ resolveModel: vi.fn((): unknown => null) }));
vi.mock('../model-catalog/model-manager.electron', () => ({ default: modelManager }));
vi.mock('../lib/i18n-main', () => ({
  mainLocale: () => 'en-US',
  mainStrings: () => ({
    translate: {
      native: {
        cloudAllowRemember: 'allow',
        cloudDenyRemember: 'deny',
        cloudNotNow: 'later',
        cloudTitle: 'Cloud?',
        cloudMessage: 'Send abroad?',
        cloudDetailTarget: '{target}',
        cloudDetailText: '{count}',
      },
    },
  }),
}));
vi.mock('@tepegoz/i18n', () => ({ formatNumber: (n: number) => String(n) }));

type Mod = typeof import('./translate-host.electron');
async function load(): Promise<Mod> {
  vi.resetModules();
  return import('./translate-host.electron');
}
const o = (): Opts => cap.opts!;

beforeEach(() => {
  vi.clearAllMocks();
  store.readJsonFile.mockReturnValue(undefined);
  prefs.getAll.mockReturnValue({
    translate: { mode: 'auto' },
    extensions: [{ id: 'ext-translate' }],
  });
  isExtensionEnabled.mockReturnValue(true);
  isSensitiveSite.mockReturnValue(true);
  vault.listMeta.mockReturnValue([]);
  vault.getFirstKeyForProvider.mockReturnValue(null);
  llama.mockReturnValue({ isAvailable: () => false });
  modelManager.resolveModel.mockReturnValue(null);
  bw.getAllWindows.mockReturnValue([]);
  bw.getFocusedWindow.mockReturnValue(null);
  isRunnableProvider.mockReturnValue(false);
  gateway.complete.mockResolvedValue({ text: '{}' });
  parseModel.mockReturnValue({ items: [{ id: '1', translatedText: 'merhaba' }] });
});

describe('the adapter closures', () => {
  it('getPersisted / setPersisted read + write PreferenceStore.translate', async () => {
    await load();
    expect(o().getPersisted()).toEqual({ mode: 'auto' });
    o().setPersisted({ mode: 'off' });
    expect(prefs.update).toHaveBeenCalledWith({ translate: { mode: 'off' } });
  });

  it('isExtensionEnabled consults the gate with the translate id', async () => {
    await load();
    isExtensionEnabled.mockReturnValue(false);
    expect(o().isExtensionEnabled()).toBe(false);
    expect(isExtensionEnabled).toHaveBeenCalledWith([{ id: 'ext-translate' }], 'ext-translate');
  });

  it('getResolvedLocale returns the app locale', async () => {
    await load();
    expect(o().getResolvedLocale()).toBe('en-US');
  });

  it('localAvailable is true only when the engine is up and a model resolves', async () => {
    await load();
    expect(o().localAvailable()).toBe(false);
    llama.mockReturnValue({ isAvailable: () => true });
    modelManager.resolveModel.mockReturnValue({ id: 'm' });
    expect(o().localAvailable()).toBe(true);
  });

  it('isSensitiveOrigin short-circuits on an empty origin, else delegates', async () => {
    await load();
    expect(o().isSensitiveOrigin('')).toBe(false);
    expect(isSensitiveSite).not.toHaveBeenCalled();
    expect(o().isSensitiveOrigin('https://bank.example')).toBe(true);
    expect(isSensitiveSite).toHaveBeenCalledWith('https://bank.example');
  });

  it('memoryLookup / memoryStore round-trip through the JSON store', async () => {
    store.readJsonFile.mockReturnValue({ version: 1, entries: { hello: 'merhaba' } });
    await load();
    expect(o().memoryLookup('hello')).toBe('merhaba');
    expect(o().memoryLookup('absent')).toBeNull();
    o().memoryStore('bye', 'gule gule');
    expect(store.writeJsonFile).toHaveBeenCalledWith(
      expect.stringContaining('translate-memory.json'),
      expect.objectContaining({ entries: expect.objectContaining({ bye: 'gule gule' }) as object }),
    );
  });

  it('falls back to an empty memory file when the persisted store is missing or invalid', async () => {
    store.readJsonFile.mockReturnValue(undefined);
    await load();
    expect(o().memoryLookup('hello')).toBeNull();
  });

  it('memoryStore is a no-op (no re-write) when the key already maps to the same value', async () => {
    store.readJsonFile.mockReturnValue({ version: 1, entries: { hello: 'merhaba' } });
    await load();
    o().memoryStore('hello', 'merhaba');
    expect(store.writeJsonFile).not.toHaveBeenCalled();
  });

  it('evicts the oldest entry once the memory passes its 2000-entry cap', async () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 2000; i += 1) entries[`k${String(i)}`] = `v${String(i)}`;
    store.readJsonFile.mockReturnValue({ version: 1, entries });
    await load();

    o().memoryStore('extra', 'val');

    const written = store.writeJsonFile.mock.calls[0]![1] as { entries: Record<string, string> };
    expect(Object.keys(written.entries)).toHaveLength(2000);
    expect(written.entries).not.toHaveProperty('k0'); // oldest dropped
    expect(written.entries.extra).toBe('val');
  });
});

describe('the batch runners', () => {
  it('runLocalBatch 503s when no local model is available', async () => {
    await load();
    await expect(o().runLocalBatch({ items: [] })).rejects.toMatchObject({
      statusCode: 503,
      code: 'translateNoLocalModel',
    });
  });

  it('runCloudBatch 503s when no cloud provider key is available', async () => {
    await load();
    await expect(o().runCloudBatch({ items: [] })).rejects.toMatchObject({
      statusCode: 503,
      code: 'translateNoCloudProvider',
    });
  });

  it('runCloudBatch 503s when a runnable provider is found but has no usable key', async () => {
    isRunnableProvider.mockReturnValue(true);
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    vault.getFirstKeyForProvider.mockReturnValue(null);
    await load();
    await expect(o().runCloudBatch({ items: [] })).rejects.toMatchObject({
      statusCode: 503,
      code: 'translateNoCloudProvider',
    });
  });

  it('runLocalBatch registers the local provider and completes through the model gateway', async () => {
    llama.mockReturnValue({ isAvailable: () => true });
    modelManager.resolveModel.mockReturnValue({ id: 'm' });
    await load();
    const res = await o().runLocalBatch({ items: [{ id: '1', text: 'hello' }], glossaryTerms: [] });
    expect(gateway.register).toHaveBeenCalled();
    expect(gateway.complete).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'local', capability: 'extract', responseFormat: 'json' }),
    );
    expect(res).toMatchObject({ items: [{ id: '1', translatedText: 'merhaba' }], durationMs: 0 });
  });

  it('runCloudBatch resolves an external provider from the vault and completes', async () => {
    isRunnableProvider.mockReturnValue(true);
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    vault.getFirstKeyForProvider.mockReturnValue('sk-test');
    await load();
    const res = await o().runCloudBatch({ items: [{ id: '1', text: 'hi' }], glossaryTerms: [] });
    expect(gateway.register).toHaveBeenCalled();
    expect(gateway.complete).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', capability: 'extract' }),
    );
    expect(res).toMatchObject({ durationMs: 0 });
  });

  it.each([
    ['gemini', 'g'],
    ['kimi', 'k'],
    ['nova', 'n'],
    ['deepseek', 'd'],
    ['xai', 'x'],
    ['groq', 'q'],
    ['anthropic', 'a'], // else branch of registerExternalProvider + modelFor default
  ])('runCloudBatch registers the %s provider and completes with its model', async (provider, model) => {
    isRunnableProvider.mockReturnValue(true);
    vault.listMeta.mockReturnValue([{ provider, region: 'r' }]);
    vault.getFirstKeyForProvider.mockReturnValue('sk');
    await load();
    await o().runCloudBatch({ items: [{ id: '1', text: 'hi' }], glossaryTerms: [] });
    expect(gateway.register).toHaveBeenCalledTimes(1);
    expect(gateway.complete).toHaveBeenCalledWith(expect.objectContaining({ provider, model }));
  });

  it('renders glossary terms into the system prompt when there are any', async () => {
    isRunnableProvider.mockReturnValue(true);
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    vault.getFirstKeyForProvider.mockReturnValue('sk');
    await load();
    await o().runCloudBatch({
      items: [{ id: '1', text: 'a cat' }],
      glossaryTerms: [{ source: 'cat', target: 'kedi' }],
    });
    const call = gateway.complete.mock.calls[0]![0] as { messages: { content: string }[] };
    expect(call.messages[0]?.content).toContain('cat => kedi');
  });
});

describe('requestCloudFallback', () => {
  it('broadcasts the request and resolves the native dialog answer', async () => {
    const w = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    bw.getAllWindows.mockReturnValue([w]);
    dialog.showMessageBox.mockResolvedValue({ response: 0 } as never);
    await load();
    const res = await o().requestCloudFallback({
      requestId: 'r1',
      origin: 'https://x.example',
      targetLanguage: 'tr',
      textCharCount: 42,
    });
    expect(w.webContents.send).toHaveBeenCalledWith(
      'translate:cloud-req',
      expect.objectContaining({ requestId: 'r1' }),
    );
    expect(res).toEqual({ requestId: 'r1', allow: true, remember: true });
  });

  it('a "deny but remember" native answer maps to allow:false remember:true', async () => {
    dialog.showMessageBox.mockResolvedValue({ response: 1 } as never);
    await load();
    const res = await o().requestCloudFallback({
      requestId: 'r2',
      origin: 'https://x.example',
      targetLanguage: 'tr',
      textCharCount: 10,
    });
    expect(res).toEqual({ requestId: 'r2', allow: false, remember: true });
  });

  it('times out to allow:false remember:false after 120s with no answer', async () => {
    bw.getAllWindows.mockReturnValue([]);
    dialog.showMessageBox.mockReturnValue(new Promise<never>(() => undefined));
    await load();
    vi.useFakeTimers();
    try {
      const pending = o().requestCloudFallback({
        requestId: 'to-1',
        origin: 'https://x.example',
        targetLanguage: 'tr',
        textCharCount: 5,
      });
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(pending).resolves.toEqual({
        requestId: 'to-1',
        allow: false,
        remember: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the module surface', () => {
  it('translateCapabilityHost.translateText delegates to the host', async () => {
    const mod = await load();
    cap.host.translateText.mockResolvedValue({ items: [{ id: '1', translatedText: 'x' }] });
    await expect(
      mod.translateCapabilityHost.translateText({ items: [] } as never),
    ).resolves.toEqual({
      items: [{ id: '1', translatedText: 'x' }],
    });
  });

  it('setTranslatePageState forwards to the host and broadcasts to every window', async () => {
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    bw.getAllWindows.mockReturnValue([win]);
    const mod = await load();
    mod.setTranslatePageState({ active: true } as never);
    expect(cap.host.setPageState).toHaveBeenCalledWith({ active: true });
    expect(win.webContents.send).toHaveBeenCalledWith('translate:page-state', { active: true });
  });

  it('respondTranslateCloudFallback settles a pending native cloud-fallback request', async () => {
    const mod = await load();
    const pending = o().requestCloudFallback({
      requestId: 'req-1',
      origin: 'https://x.example',
      targetLanguage: 'tr',
      textCharCount: 42,
    });
    mod.respondTranslateCloudFallback({ requestId: 'req-1', allow: true, remember: true });
    await expect(pending).resolves.toEqual({ requestId: 'req-1', allow: true, remember: true });
  });
});
