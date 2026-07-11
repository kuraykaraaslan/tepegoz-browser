import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import CredentialVault, { type SecretCrypto } from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import {
  TokenLedger,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import type { LlamaEngine, LocalProviderConfig } from '@tepegoz/local-inference';
import { runAgent, type AgentRunDeps, type AgentRunHooks } from './agent-runtime';

/** Reversible fake crypto (no OS keychain) so CredentialVault can init in a unit test. */
const fakeCrypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decrypt: (blob) => blob.toString('utf8').replace(/^enc:/, ''),
};

const DEPS: AgentRunDeps = {
  activeTabUrl: () => undefined,
  handoffStrings: { captcha: 'captcha', twofa: '2fa', login: 'login' },
};

function hooks(): AgentRunHooks {
  return {
    onEvent: vi.fn(),
    requestPlanApproval: () => Promise.resolve({ approved: false }),
    requestApproval: () => Promise.resolve(false),
    signal: { aborted: false },
  };
}

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

describe('runAgent guards (before any model/tool call)', () => {
  it('resolves a Gemini-only vault now that Gemini is a wired provider', async () => {
    CredentialVault.addKey('gemini', 'work', 'gm-only');
    // Mock the key fetch to stop before the live model call — we only assert the resolved provider.
    const spy = vi.spyOn(CredentialVault, 'getFirstKeyForProvider').mockImplementation(() => {
      throw new Error('stop-before-network');
    });
    await expect(runAgent('do a thing', hooks(), DEPS)).rejects.toThrow('stop-before-network');
    expect(spy).toHaveBeenCalledWith('gemini');
    spy.mockRestore();
  });

  it('rejects when no API key is stored at all', async () => {
    await expect(runAgent('do a thing', hooks(), DEPS)).rejects.toThrow(/API key/i);
  });

  it('resolves the highest-priority stored key (Gemini on top, now wired)', async () => {
    // Top (highest-priority) key is Gemini and a lower OpenAI key sits below it: the run resolves to
    // the TOP key. Mock the key fetch to stop before the live model call.
    CredentialVault.addKey('gemini', 'work', 'gm-top');
    CredentialVault.addKey('openai', 'personal', 'sk-openai-lower');
    const spy = vi.spyOn(CredentialVault, 'getFirstKeyForProvider').mockImplementation(() => {
      throw new Error('stop-before-network');
    });
    await expect(runAgent('do a thing', hooks(), DEPS)).rejects.toThrow('stop-before-network');
    expect(spy).toHaveBeenCalledWith('gemini');
    spy.mockRestore();
  });

  it('runs whole-agent-local (no vault key) when localProvider.mode is default and a model is available', async () => {
    // No API key stored at all, yet a run proceeds on-device: it must reach the LOCAL engine (not a
    // "no API key" error). A fake engine throws a sentinel to stop before real generation.
    PreferenceStore.update({ localProvider: { mode: 'default', selectedModelId: 'tepegoz-slm-1' } });
    const engine: LlamaEngine = {
      isAvailable: () => true,
      load: () => Promise.resolve({ modelId: 'tepegoz-slm-1', ctxSize: 2048 }),
      generate: () => Promise.reject(new Error('stop-at-local-engine')),
      unload: () => Promise.resolve(),
    };
    const localInference: LocalProviderConfig = {
      engine,
      resolveModel: () => ({ modelId: 'tepegoz-slm-1', modelPath: '/m.gguf', ctxSize: 2048 }),
    };
    await expect(runAgent('do a thing', hooks(), { ...DEPS, localInference })).rejects.toThrow(
      'stop-at-local-engine',
    );
  });

  it('honors a usable agentProviderOverride (panel model selector) over the top vault key', async () => {
    CredentialVault.addKey('anthropic', 'a', 'sk-ant-1'); // top key = anthropic
    CredentialVault.addKey('openai', 'o', 'sk-openai-1');
    PreferenceStore.update({ agentProviderOverride: 'openai' });
    const spy = vi.spyOn(CredentialVault, 'getFirstKeyForProvider').mockImplementation(() => {
      throw new Error('stop-at-key');
    });
    await expect(runAgent('x', hooks(), DEPS)).rejects.toThrow('stop-at-key');
    expect(spy).toHaveBeenCalledWith('openai'); // resolved the override, not the top anthropic key
    spy.mockRestore();
  });

  it('ignores an unusable override (no key for it) and falls back to the stored key', async () => {
    CredentialVault.addKey('anthropic', 'a', 'sk-ant-1'); // only anthropic has a key
    PreferenceStore.update({ agentProviderOverride: 'openai' }); // openai override is unusable
    const spy = vi.spyOn(CredentialVault, 'getFirstKeyForProvider').mockImplementation((p) => {
      if (p === 'anthropic') throw new Error('stop-at-anthropic');
      return null; // openai → null → the override is skipped, resolver falls through
    });
    await expect(runAgent('x', hooks(), DEPS)).rejects.toThrow('stop-at-anthropic');
    spy.mockRestore();
  });

  it('uses an injected provider (eval seam) and bypasses vault resolution entirely', async () => {
    // No API key stored anywhere. The old path would throw "No API key" during resolveProvider BEFORE
    // any model call; the seam must instead reach the injected provider — proven by its sentinel throw.
    const injected: ModelProvider = {
      id: 'anthropic',
      complete: (): Promise<CanonResponse> => Promise.reject(new Error('reached-injected-provider')),
    };
    await expect(
      runAgent('do a thing', hooks(), { ...DEPS, provider: { id: 'anthropic', instance: injected } }),
    ).rejects.toThrow('reached-injected-provider');
  });

  it('resets the token ledger at the start of each run (per-task counter, not session-cumulative)', async () => {
    TokenLedger.record('anthropic', 'claude-opus-4-8', 'plan', { inputTokens: 100, outputTokens: 50 });
    expect(TokenLedger.totals().totalTokens).toBeGreaterThan(0);
    // No key configured → the run throws in resolution, but the reset runs first.
    await expect(runAgent('x', hooks(), DEPS)).rejects.toThrow();
    expect(TokenLedger.totals().totalTokens).toBe(0);
  });
});
