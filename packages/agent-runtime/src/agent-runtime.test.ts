import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import CredentialVault, { type SecretCrypto } from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { TokenLedger, type CanonResponse, type ModelProvider } from '@tepegoz/model-gateway';
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
  tabSpawnStrings: {
    opened: 'opened',
    followBlocked: 'follow-blocked',
    returnedToOrigin: 'returned',
  },
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
    PreferenceStore.update({
      localProvider: { mode: 'default', selectedModelId: 'tepegoz-slm-1' },
    });
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
      complete: (): Promise<CanonResponse> =>
        Promise.reject(new Error('reached-injected-provider')),
    };
    await expect(
      runAgent('do a thing', hooks(), {
        ...DEPS,
        provider: { id: 'anthropic', instance: injected },
      }),
    ).rejects.toThrow('reached-injected-provider');
  });

  it('resets the token ledger at the start of each run (per-task counter, not session-cumulative)', async () => {
    TokenLedger.record('anthropic', 'claude-opus-4-8', 'plan', {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(TokenLedger.totals().totalTokens).toBeGreaterThan(0);
    // No key configured → the run throws in resolution, but the reset runs first.
    await expect(runAgent('x', hooks(), DEPS)).rejects.toThrow();
    expect(TokenLedger.totals().totalTokens).toBe(0);
  });
});

describe('runAgent — plan phase, approval, and egress-during-planning', () => {
  const validPlan = {
    goal: 'read the page',
    steps: [{ id: 's1', tool: 'browser_get_elements', args: {}, rationale: 'r', dependsOn: [] }],
  };

  beforeEach(async () => {
    const { CapabilityRegistry } = await import('@tepegoz/capability-plane');
    CapabilityRegistry.reset();
    CapabilityRegistry.register({
      descriptor: {
        id: 'browser_get_elements',
        description: 'read the page',
        dangerClass: 'read',
        source: 'builtin',
        inputSchema: { type: 'object' },
        requiresIdempotencyKey: false,
      },
      inputSchema: {
        safeParse: (data: unknown) =>
          typeof data === 'object' && data !== null
            ? { success: true as const, data }
            : { success: false as const, error: { issues: ['expected an object'] } },
      },
      handler: () => ({ content: 'els' }),
    });
  });

  /** A provider whose complete() is scripted by `reply` (a fn of the call index). */
  class ScriptedProvider implements ModelProvider {
    readonly id = 'anthropic' as const;
    private turn = 0;
    constructor(private readonly reply: (turn: number) => CanonResponse | Error) {}
    complete(): Promise<CanonResponse> {
      const r = this.reply(this.turn++);
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    }
  }
  const resp = (text: string): CanonResponse => ({
    text,
    stopReason: 'end',
    usage: { inputTokens: 10, outputTokens: text.length },
    toolCalls: [],
  });
  const inject = (p: ModelProvider): AgentRunDeps => ({
    ...DEPS,
    provider: { id: 'anthropic', instance: p },
  });

  it('reaches plan approval and stops "plan_rejected" when the user rejects the plan (also seeds the token ledger)', async () => {
    const h = hooks(); // default requestPlanApproval → { approved: false }
    const provider = new ScriptedProvider(() => resp(JSON.stringify(validPlan)));
    const res = await runAgent('do it', h, {
      ...inject(provider),
      tokenBudget: { quota: 100_000, lifetimeUsed: 250 },
      runTokenCeiling: 50_000,
    });
    expect(res.stoppedReason).toBe('plan_rejected');
    expect(res.ok).toBe(false);
    expect(h.onEvent).toHaveBeenCalledWith('plan', expect.stringContaining('1 step'), expect.any(String));
  });

  it('stops "aborted" when the signal is already tripped after the plan is ready', async () => {
    const h: AgentRunHooks = { ...hooks(), signal: { aborted: true } };
    const provider = new ScriptedProvider(() => resp(JSON.stringify(validPlan)));
    const res = await runAgent('do it', h, inject(provider));
    expect(res.stoppedReason).toBe('aborted');
  });

  it('stops "egress_blocked" when the Egress Firewall blocks the planning request', async () => {
    const { AppError } = await import('@tepegoz/libs');
    const h = hooks();
    const provider = new ScriptedProvider(
      () => new AppError('blocked: the outbound model request looked like a secret', 403),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(res.stoppedReason).toBe('egress_blocked');
    expect(h.onEvent).toHaveBeenCalledWith('error', expect.any(String));
  });
});
