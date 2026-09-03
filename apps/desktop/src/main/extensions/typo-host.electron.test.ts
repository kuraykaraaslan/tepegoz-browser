import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `typo-host.electron` — the main-process wiring that hands `createTypoHost` its adapters, plus the
 * `typoCapabilityHost` shim. Pinned: each adapter closure routes correctly (prefs get/set, the
 * extension-enablement gate with the typo id, the installed-dictionary list); `dictionaryFor` returns
 * null and drops its cache entry when no dictionary is installed for a language; and
 * `typoCapabilityHost.checkTypoText` delegates to the host's `check`.
 */

type Cfg = {
  getPersisted: () => unknown;
  setPersisted: (v: unknown) => void;
  isExtensionEnabled: () => boolean;
  dictionaries: () => unknown;
  dictionaryFor: (lang: string) => unknown;
  aiReview: unknown;
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

// Heavy transitive deps the module imports at load — stubbed so it just resolves.
vi.mock('@tepegoz/model-gateway', () => ({
  ModelGateway: { register: vi.fn() },
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
vi.mock('@tepegoz/local-inference', () => ({ LocalProvider: class {} }));
vi.mock('@tepegoz/shared-types', () => ({ isRunnableProvider: () => false }));
vi.mock('@tepegoz/credential-vault', () => ({
  default: { listMeta: () => [], getFirstKeyForProvider: () => null },
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn() } }));
vi.mock('../local-inference/llama-engine.electron', () => ({
  llamaEngine: () => ({ isAvailable: () => false }),
}));
vi.mock('../model-catalog/model-manager.electron', () => ({
  default: { resolveModel: () => null },
}));

const mod = await import('./typo-host.electron');
const cfg = () => cap.cfg!;

beforeEach(() => {
  vi.clearAllMocks();
  prefs.getAll.mockReturnValue({ typo: { aiMode: 'auto' }, extensions: [{ id: 'ext-typo' }] });
  isExtensionEnabled.mockReturnValue(true);
  dictMgr.list.mockReturnValue([{ id: 'en-US', language: 'en' }]);
  dictMgr.loadInstalled.mockReturnValue(null);
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

  it('dictionaryFor returns null (and drops any cache entry) when nothing is installed', () => {
    expect(cfg().dictionaryFor('fr')).toBeNull();
    expect(dictMgr.loadInstalled).toHaveBeenCalledWith('fr');
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
