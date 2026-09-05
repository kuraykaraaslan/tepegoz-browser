import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `typo-host.electron` — the main-process wiring that hands `createTypoHost` its adapters, plus the
 * `typoCapabilityHost` shim. Pinned: each adapter closure routes correctly (prefs get/set, the
 * extension gate with the typo id, the dictionary list); `dictionaryFor` builds + caches an nspell
 * instance per installed dictionary (null + cache-drop when none is installed); and the `aiReview`
 * closure short-circuits on empty text / `aiMode: 'none'`, runs a local-LLM pass when the flag + engine
 * allow it, an external-AI pass under manual mode, and swallows a review failure with a log.
 */

type Cfg = {
  getPersisted: () => unknown;
  setPersisted: (v: unknown) => void;
  isExtensionEnabled: () => boolean;
  dictionaries: () => unknown;
  dictionaryFor: (lang: string) => { correct: (w: string) => boolean } | null;
  aiReview: (
    input: { text: string; aiMode: string },
    base: Record<string, unknown>,
    settings: { localLlmMode?: string; externalAiMode?: string },
  ) => Promise<Record<string, unknown>>;
};
const cap = vi.hoisted((): { cfg?: Cfg; check: ReturnType<typeof vi.fn> } => ({
  check: vi.fn(() => Promise.resolve({ issues: [] })),
}));
vi.mock('@tepegoz/ext-typo/host', () => ({
  TYPO_EXTENSION_ID: 'ext-typo',
  createTypoHost: (cfg: Cfg) => {
    cap.cfg = cfg;
    return { check: cap.check, __host: true };
  },
}));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ typo: { aiMode: 'auto' }, extensions: [{ id: 'ext-typo' }] })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const isExtensionEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/desktop-ipc', () => ({ isExtensionEnabled }));

const dictMgr = vi.hoisted(() => ({
  list: vi.fn(() => [{ id: 'en-US', language: 'en' }]),
  loadInstalled: vi.fn((): unknown => null),
}));
vi.mock('./typo-dictionary-manager.electron', () => ({ default: dictMgr }));

const gateway = vi.hoisted(() => ({ register: vi.fn(), complete: vi.fn() }));
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
  NOVA_MODEL: { classify: 'n' },
  DEEPSEEK_MODEL: { classify: 'd' },
  XAI_MODEL: { classify: 'x' },
  GROQ_MODEL: { classify: 'q' },
  LOCAL_MODEL: { classify: 'l' },
}));
vi.mock('@tepegoz/local-inference', () => ({
  LocalProvider: class {
    constructor(public opts: { resolveModel: () => unknown }) {}
  },
}));
const isRunnableProvider = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/shared-types', () => ({ isRunnableProvider }));
const vault = vi.hoisted(() => ({
  listMeta: vi.fn((): unknown[] => []),
  getFirstKeyForProvider: vi.fn((): string | null => null),
}));
vi.mock('@tepegoz/credential-vault', () => ({ default: vault }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
const llama = vi.hoisted(() =>
  vi.fn<() => { isAvailable: () => boolean }>(() => ({ isAvailable: () => false })),
);
vi.mock('../local-inference/llama-engine.electron', () => ({ llamaEngine: llama }));
const modelManager = vi.hoisted(() => ({ resolveModel: vi.fn((): unknown => null) }));
vi.mock('../model-catalog/model-manager.electron', () => ({ default: modelManager }));

const mod = await import('./typo-host.electron');
const cfg = () => cap.cfg!;
const base = () => ({ issues: [] as unknown[], language: 'en', sourcesUsed: [] as string[] });

beforeEach(() => {
  vi.clearAllMocks();
  prefs.getAll.mockReturnValue({ typo: { aiMode: 'auto' }, extensions: [{ id: 'ext-typo' }] });
  isExtensionEnabled.mockReturnValue(true);
  dictMgr.list.mockReturnValue([{ id: 'en-US', language: 'en' }]);
  dictMgr.loadInstalled.mockReturnValue(null);
  llama.mockReturnValue({ isAvailable: () => false });
  modelManager.resolveModel.mockReturnValue(null);
  vault.listMeta.mockReturnValue([]);
  isRunnableProvider.mockReturnValue(true);
  gateway.complete.mockResolvedValue({ text: '{"issues":[]}' });
});

it('the default export is whatever createTypoHost returned', () => {
  expect(mod.default).toMatchObject({ __host: true });
});

describe('the adapter closures', () => {
  it('getPersisted / setPersisted read + write PreferenceStore.typo', () => {
    expect(cfg().getPersisted()).toEqual({ aiMode: 'auto' });
    cfg().setPersisted({ aiMode: 'off' });
    expect(prefs.update).toHaveBeenCalledWith({ typo: { aiMode: 'off' } });
  });

  it('isExtensionEnabled consults the gate with the typo extension id', () => {
    isExtensionEnabled.mockReturnValue(false);
    expect(cfg().isExtensionEnabled()).toBe(false);
    expect(isExtensionEnabled).toHaveBeenCalledWith([{ id: 'ext-typo' }], 'ext-typo');
  });

  it('dictionaries returns the installed-dictionary list', () => {
    expect(cfg().dictionaries()).toEqual([{ id: 'en-US', language: 'en' }]);
  });
});

describe('dictionaryFor', () => {
  it('returns null and drops any cache entry when nothing is installed', () => {
    expect(cfg().dictionaryFor('fr')).toBeNull();
    expect(dictMgr.loadInstalled).toHaveBeenCalledWith('fr');
  });

  it('builds a spell instance for an installed dictionary and caches it by id', () => {
    dictMgr.loadInstalled.mockReturnValue({ id: 'en-US', aff: 'SET UTF-8\n', dic: '1\nword\n' });
    const first = cfg().dictionaryFor('en');
    expect(typeof first?.correct).toBe('function');

    expect(cfg().dictionaryFor('en')).toBe(first); // same id → same cached instance

    dictMgr.loadInstalled.mockReturnValue({ id: 'en-GB', aff: 'SET UTF-8\n', dic: '1\ncolour\n' });
    expect(cfg().dictionaryFor('en')).not.toBe(first); // id changed → rebuilt
  });
});

describe('aiReview', () => {
  it('short-circuits on empty text or aiMode "none"', async () => {
    const b = base();
    expect(await cfg().aiReview({ text: '   ', aiMode: 'auto' }, b, {})).toBe(b);
    expect(await cfg().aiReview({ text: 'hello', aiMode: 'none' }, b, {})).toBe(b);
    expect(gateway.complete).not.toHaveBeenCalled();
  });

  it('runs a local-LLM pass and merges the returned issues', async () => {
    llama.mockReturnValue({ isAvailable: () => true });
    modelManager.resolveModel.mockReturnValue({ id: 'm' });
    gateway.complete.mockResolvedValue({
      text: '{"issues":[{"kind":"spelling","text":"teh","message":"typo","suggestions":["the"]}]}',
    });
    const res = await cfg().aiReview({ text: 'teh cat sat', aiMode: 'auto' }, base(), {
      localLlmMode: 'auto',
    });
    expect(gateway.register).toHaveBeenCalled();
    expect((res.issues as { source: string }[])[0]).toMatchObject({
      source: 'local-llm',
      kind: 'spelling',
    });
    const registered = gateway.register.mock.calls[0]![0] as { opts: { resolveModel: () => unknown } };
    expect(registered.opts.resolveModel()).toEqual({ id: 'm' });
  });

  it('does not register the local provider when auto mode is on but the engine/model is unavailable', async () => {
    llama.mockReturnValue({ isAvailable: () => false });
    await cfg().aiReview({ text: 'teh cat sat', aiMode: 'auto' }, base(), { localLlmMode: 'auto' });
    expect(gateway.register).not.toHaveBeenCalled();
  });

  it('swallows a local review failure with a warning', async () => {
    llama.mockReturnValue({ isAvailable: () => true });
    modelManager.resolveModel.mockReturnValue({ id: 'm' });
    gateway.complete.mockRejectedValue(new Error('model timeout'));
    const b = base();
    expect(await cfg().aiReview({ text: 'teh', aiMode: 'auto' }, b, { localLlmMode: 'auto' })).toBe(
      b,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Typo local LLM review failed',
      expect.objectContaining({ err: expect.stringContaining('model timeout') as string }),
    );
  });

  it('skips external AI when no stored key belongs to a runnable provider', async () => {
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    isRunnableProvider.mockReturnValue(false);
    await cfg().aiReview({ text: 'the cat sat', aiMode: 'manual' }, base(), {
      externalAiMode: 'manual',
    });
    expect(gateway.register).not.toHaveBeenCalled();
  });

  it('skips external AI when the runnable provider has no usable key', async () => {
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    vault.getFirstKeyForProvider.mockReturnValue(null);
    await cfg().aiReview({ text: 'the cat sat', aiMode: 'manual' }, base(), {
      externalAiMode: 'manual',
    });
    expect(gateway.register).not.toHaveBeenCalled();
  });

  it('runs an external-AI pass under manual mode with a runnable provider key', async () => {
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    vault.getFirstKeyForProvider.mockReturnValue('sk-test');
    gateway.complete.mockResolvedValue({
      text: '{"issues":[{"kind":"grammar","text":"cat sat","message":"awkward","suggestions":[]}]}',
    });
    const res = await cfg().aiReview({ text: 'the cat sat', aiMode: 'manual' }, base(), {
      externalAiMode: 'manual',
    });
    expect(gateway.register).toHaveBeenCalled();
    expect((res.issues as { source: string }[])[0]).toMatchObject({ source: 'external-ai' });
  });

  it.each([
    ['gemini', 'g'],
    ['kimi', 'a'], // kimi has no modelFor branch -> Anthropic classify model
    ['nova', 'n'],
    ['deepseek', 'd'],
    ['xai', 'x'],
    ['groq', 'q'],
    ['anthropic', 'a'], // the else branch of registerExternalProvider
  ])('registers the %s provider and completes with its classify model', async (provider, model) => {
    vault.listMeta.mockReturnValue([{ provider, region: 'r' }]);
    vault.getFirstKeyForProvider.mockReturnValue('sk');
    gateway.complete.mockResolvedValue({ text: '{"issues":[]}' });
    await cfg().aiReview({ text: 'a sentence here', aiMode: 'manual' }, base(), {
      externalAiMode: 'manual',
    });
    expect(gateway.register).toHaveBeenCalledTimes(1);
    expect(gateway.complete).toHaveBeenCalledWith(expect.objectContaining({ provider, model }));
  });

  it('honours an AI issue’s explicit start/end offsets when they are in range', async () => {
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    vault.getFirstKeyForProvider.mockReturnValue('sk');
    gateway.complete.mockResolvedValue({
      text: '{"issues":[{"kind":"grammar","text":"cat","start":4,"end":7,"message":"m","suggestions":[]}]}',
    });
    const res = await cfg().aiReview({ text: 'the cat sat', aiMode: 'manual' }, base(), {
      externalAiMode: 'manual',
    });
    expect((res.issues as { start: number; end: number }[])[0]).toMatchObject({ start: 4, end: 7 });
  });

  it('drops an AI issue whose text cannot be located and returns base when the response fails schema', async () => {
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    vault.getFirstKeyForProvider.mockReturnValue('sk');
    gateway.complete.mockResolvedValue({
      text: '{"issues":[{"kind":"grammar","text":"not in the source","message":"m","suggestions":[]}]}',
    });
    const res = await cfg().aiReview({ text: 'the cat sat', aiMode: 'manual' }, base(), {
      externalAiMode: 'manual',
    });
    expect(res.issues).toEqual([]);

    gateway.complete.mockResolvedValue({ text: '{"issues":"not-an-array"}' });
    const b = base();
    expect(
      await cfg().aiReview({ text: 'the cat sat', aiMode: 'manual' }, b, {
        externalAiMode: 'manual',
      }),
    ).toBe(b);
  });

  it('dedupes an AI issue matching an already-seen range+kind, and marks a style issue as info severity', async () => {
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    vault.getFirstKeyForProvider.mockReturnValue('sk');
    gateway.complete.mockResolvedValue({
      text:
        '{"issues":[' +
        '{"kind":"style","text":"cat","start":4,"end":7,"message":"m1","suggestions":[]},' +
        '{"kind":"style","text":"cat","start":4,"end":7,"message":"m2","suggestions":[]}' +
        ']}',
    });
    const res = await cfg().aiReview({ text: 'the cat sat', aiMode: 'manual' }, base(), {
      externalAiMode: 'manual',
    });
    const issues = res.issues as { severity: string }[];
    expect(issues).toHaveLength(1); // the second, identical-range issue was deduped
    expect(issues[0]!.severity).toBe('info'); // style → info, not warning
  });

  it('swallows an external review failure with a warning', async () => {
    vault.listMeta.mockReturnValue([{ provider: 'openai', region: 'us' }]);
    vault.getFirstKeyForProvider.mockReturnValue('sk');
    gateway.complete.mockRejectedValue(new Error('ext boom'));
    const b = base();
    expect(
      await cfg().aiReview({ text: 'the cat sat', aiMode: 'manual' }, b, {
        externalAiMode: 'manual',
      }),
    ).toBe(b);
    expect(logger.warn).toHaveBeenCalledWith(
      'Typo external AI review failed',
      expect.objectContaining({ err: expect.stringContaining('ext boom') as string }),
    );
  });
});

describe('typoCapabilityHost', () => {
  it('checkTypoText delegates to the host check', async () => {
    cap.check.mockResolvedValue({ issues: [{ kind: 'spelling' }] });
    expect(await mod.typoCapabilityHost.checkTypoText({ text: 'teh' })).toEqual({
      issues: [{ kind: 'spelling' }],
    });
    expect(cap.check).toHaveBeenCalledWith({ text: 'teh' });
  });
});
