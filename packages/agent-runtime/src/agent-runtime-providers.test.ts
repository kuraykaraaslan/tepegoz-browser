import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import CredentialVault, { type SecretCrypto } from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { ModelGateway, PROVIDER_MODEL_CATALOG } from '@tepegoz/model-gateway';
import type { AIProvider } from '@tepegoz/shared-types';
import { hotSwapRunProvider, registerRunProvider } from './agent-runtime-providers';
import type { AgentRunDeps } from './agent-runtime-types';

/** Reversible fake crypto (no OS keychain) so CredentialVault can init in a unit test. */
const fakeCrypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decrypt: (blob) => blob.toString('utf8').replace(/^enc:/, ''),
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-runtime-'));
  PreferenceStore.init({ filePath: join(dir, 'preferences.json') });
  CredentialVault.init({ crypto: fakeCrypto, filePath: join(dir, 'credentials.enc.json') });
});
afterEach(() => {
  PreferenceStore.reset();
  rmSync(dir, { recursive: true, force: true });
});

describe('hotSwapRunProvider (live mid-run provider switch)', () => {
  beforeEach(() => {
    ModelGateway.reset();
  });

  it('is a no-op for local (needs engine/model wiring — applies at the next run)', () => {
    const register = vi.spyOn(ModelGateway, 'register');
    const setOverride = vi.spyOn(ModelGateway, 'setModelOverride');
    expect(hotSwapRunProvider('local', { effort: 'high', model: '' })).toBe(false);
    expect(register).not.toHaveBeenCalled();
    expect(setOverride).not.toHaveBeenCalled();
    register.mockRestore();
    setOverride.mockRestore();
  });

  it('is a no-op when the target provider has no stored key (run stays put)', () => {
    const setOverride = vi.spyOn(ModelGateway, 'setModelOverride');
    expect(hotSwapRunProvider('openai', { effort: 'high', model: '' })).toBe(false);
    expect(setOverride).not.toHaveBeenCalled();
    setOverride.mockRestore();
  });

  it('registers the adapter and pins the provider’s primary model when unpinned', () => {
    CredentialVault.addKey('openai', 'work', 'sk-openai-hot');
    const register = vi.spyOn(ModelGateway, 'register');
    const setOverride = vi.spyOn(ModelGateway, 'setModelOverride');
    const primary = PROVIDER_MODEL_CATALOG.openai[0]?.id ?? '';
    expect(hotSwapRunProvider('openai', { effort: 'high', model: '' })).toBe(true);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: 'openai' }));
    expect(setOverride).toHaveBeenCalledWith({ provider: 'openai', model: primary });
    register.mockRestore();
    setOverride.mockRestore();
  });

  it('pins the explicitly requested model when one is provided', () => {
    CredentialVault.addKey('anthropic', 'a', 'sk-ant-hot');
    const setOverride = vi.spyOn(ModelGateway, 'setModelOverride');
    expect(hotSwapRunProvider('anthropic', { effort: 'high', model: 'claude-sonnet-4-6' })).toBe(
      true,
    );
    expect(setOverride).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
    setOverride.mockRestore();
  });
});

describe('registerRunProvider', () => {
  beforeEach(() => ModelGateway.reset());

  const deps = (over: Partial<AgentRunDeps> = {}): AgentRunDeps => ({ ...over }) as AgentRunDeps;
  const prefs = (over: Partial<{ agentProviderOverride: AIProvider | null; localProvider: { mode: 'off' | 'simple' | 'default' } }> = {}) => ({
    agentProviderOverride: null as AIProvider | null,
    localProvider: { mode: 'off' as const },
    ...over,
  });
  const localCfg = { engine: {} as never, resolveModel: () => null };

  /** Run `fn`, return the `{ statusCode, code }` of the AppError it threw. */
  const grabAppError = (fn: () => unknown): { statusCode: number; code?: string } => {
    try {
      fn();
    } catch (e) {
      return e as { statusCode: number; code?: string };
    }
    throw new Error('expected a throw');
  };

  it('registers an injected provider as-is and returns its id (the eval/test seam)', () => {
    const register = vi.spyOn(ModelGateway, 'register');
    const instance = { id: 'anthropic' as const, complete: () => Promise.resolve({}) } as never;
    const id = registerRunProvider(deps({ provider: { id: 'anthropic', instance } }), prefs(), false, 'high');
    expect(id).toBe('anthropic');
    expect(register).toHaveBeenCalledWith(instance);
    register.mockRestore();
  });

  it('throws 401 noApiKey when nothing is configured and local is unavailable', () => {
    expect(grabAppError(() => registerRunProvider(deps(), prefs(), false, 'high'))).toMatchObject({
      statusCode: 401,
      code: 'noApiKey',
    });
  });

  it('resolves the highest-priority stored key and builds its adapter', () => {
    CredentialVault.addKey('anthropic', 'work', 'sk-ant-1');
    const register = vi.spyOn(ModelGateway, 'register');
    const id = registerRunProvider(deps(), prefs(), false, 'medium');
    expect(id).toBe('anthropic');
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: 'anthropic' }));
    register.mockRestore();
  });

  it.each<AIProvider>(['openai', 'gemini', 'kimi', 'nova', 'deepseek', 'xai', 'groq'])(
    'builds the %s adapter when it is the per-run override',
    (provider) => {
      CredentialVault.addKey(provider, 'k', `sk-${provider}`);
      const id = registerRunProvider(deps(), prefs({ agentProviderOverride: provider }), false, 'low');
      expect(id).toBe(provider);
    },
  );

  it('honors an explicit per-run "local" override when local is available', () => {
    const id = registerRunProvider(
      deps({ localInference: localCfg }),
      prefs({ agentProviderOverride: 'local' }),
      true,
      'high',
    );
    expect(id).toBe('local');
  });

  it('picks whole-agent-local when mode:default and local is available', () => {
    const register = vi.spyOn(ModelGateway, 'register');
    const id = registerRunProvider(deps({ localInference: localCfg }), prefs({ localProvider: { mode: 'default' } }), true, 'high');
    expect(id).toBe('local');
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: 'local' }));
    register.mockRestore();
  });

  it('throws 503 inferenceUnavailable when local resolves but no engine config was passed', () => {
    expect(
      grabAppError(() =>
        registerRunProvider(deps(), prefs({ localProvider: { mode: 'default' } }), true, 'high'),
      ),
    ).toMatchObject({ statusCode: 503, code: 'inferenceUnavailable' });
  });

  it('also registers the on-device provider alongside a cloud run when local is available', () => {
    CredentialVault.addKey('anthropic', 'work', 'sk-ant-2');
    const register = vi.spyOn(ModelGateway, 'register');
    const id = registerRunProvider(deps({ localInference: localCfg }), prefs(), true, 'high');
    expect(id).toBe('anthropic');
    const registeredIds = register.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(registeredIds).toContain('anthropic');
    expect(registeredIds).toContain('local');
    register.mockRestore();
  });
});
