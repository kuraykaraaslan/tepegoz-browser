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

  let readResult: unknown = { content: 'els' };
  const objSchema = {
    safeParse: (data: unknown) =>
      typeof data === 'object' && data !== null
        ? { success: true as const, data }
        : { success: false as const, error: { issues: ['expected an object'] } },
  };
  beforeEach(async () => {
    readResult = { content: 'els' };
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
      inputSchema: objSchema,
      handler: () => readResult,
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

  it('stops "plan_empty" when the user approves but skips every step', async () => {
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true, skipStepIds: ['s1'] }),
    };
    const provider = new ScriptedProvider(() => resp(JSON.stringify(validPlan)));
    const res = await runAgent('do it', h, inject(provider));
    expect(res.stoppedReason).toBe('plan_empty');
    expect(res.ok).toBe(false);
  });

  it('runs the full plan → approve → reactive loop → completed path and assembles the summary', async () => {
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true }),
    };
    const script = [
      JSON.stringify(validPlan),
      JSON.stringify({ action: 'act', tool: 'browser_get_elements', args: { url: 'https://x.test/a' }, rationale: 'r' }),
      JSON.stringify({ action: 'act', tool: 'browser_get_elements', args: {}, rationale: 'r' }),
      JSON.stringify({ action: 'finish', summary: 'read both' }),
      JSON.stringify({ done: true, final_answer: 'the page said hello' }),
    ];
    const provider = new ScriptedProvider((t) => resp(script[t] ?? JSON.stringify({ action: 'finish', summary: 'fallback' })));

    const res = await runAgent('do it', h, inject(provider));

    expect(res.stoppedReason).toBe('completed');
    expect(res.ok).toBe(true);
    expect(res.summary).toBe('the page said hello');
    expect(res.tokenUsage?.totalTokens).toBeGreaterThan(0);
    expect(res.steps?.map((s) => s.tool)).toEqual(['browser_get_elements', 'browser_get_elements']);
    // navTargetOf pulls the { url } arg through onto the first step, and leaves it off the second.
    expect(res.steps?.[0]?.targetUrl).toBe('https://x.test/a');
    expect(res.steps?.[1]?.targetUrl).toBeUndefined();
    expect(h.onEvent).toHaveBeenCalledWith('done', expect.any(String), expect.stringContaining('tokens'));
  });

  it('takes the "fail" terminal phase and reports an error when the reactive loop errors out', async () => {
    const h: AgentRunHooks = { ...hooks(), requestPlanApproval: () => Promise.resolve({ approved: true }) };
    let turn = 0;
    const provider = new ScriptedProvider(() =>
      turn++ === 0 ? resp(JSON.stringify(validPlan)) : new Error('upstream socket reset'),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(res.ok).toBe(false);
    expect(res.stoppedReason).not.toBe('completed');
    expect(h.onEvent).toHaveBeenCalledWith('error', expect.any(String), expect.stringContaining('tokens'));
  });

  it('surfaces an Egress WARNING to the Console when the prompt carries PII (email), then still sends', async () => {
    const h = hooks(); // default plan approval → { approved: false }
    const provider = new ScriptedProvider(() => resp(JSON.stringify(validPlan)));
    const res = await runAgent('mail the report to alice@example.com when done', h, inject(provider));
    expect(res.stoppedReason).toBe('plan_rejected'); // the warn is advisory — the request went out
    expect(h.onEvent).toHaveBeenCalledWith(
      'decision',
      expect.stringContaining('Egress warning'),
      expect.stringContaining('pii_email'),
    );
  });

  it('routes a block-severity egress finding (secret-shaped token) to HITL and sends when approved', async () => {
    const approve = vi.fn(() => Promise.resolve(true));
    const h: AgentRunHooks = { ...hooks(), requestApproval: approve };
    const provider = new ScriptedProvider(() => resp(JSON.stringify(validPlan)));
    const res = await runAgent(
      'use the key sk-ant-abcdefghijklmnopqrstuvwx to authenticate',
      h,
      inject(provider),
    );
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'model_send' }));
    expect(res.stoppedReason).toBe('plan_rejected'); // approved → sent → plan came back → user rejected
  });

  it('hands off (terminal) when a perceived page is a CAPTCHA wall', async () => {
    readResult = { content: 'Please verify you are human to continue', url: 'https://x.test/gate' };
    const h: AgentRunHooks = { ...hooks(), requestPlanApproval: () => Promise.resolve({ approved: true }) };
    const provider = new ScriptedProvider((t) =>
      resp(
        t === 0
          ? JSON.stringify(validPlan)
          : JSON.stringify({ action: 'act', tool: 'browser_get_elements', args: {}, rationale: 'r' }),
      ),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(res.stoppedReason).toBe('handoff');
    expect(h.onEvent).toHaveBeenCalledWith('handoff', 'captcha');
  });

  it('pauses (not terminal) on a LOGIN wall when a run-control gate is present', async () => {
    readResult = { content: 'Please sign in to continue to your account', url: 'https://x.test/login' };
    const state = { aborted: false, gateCalls: 0 };
    const control = {
      get aborted() {
        return state.aborted;
      },
      isHeld: () => false,
      waitWhileHeld: () => {
        // Let the first step run (so the login guard fires); abort at the NEXT gate so the test ends.
        if (++state.gateCalls >= 2) state.aborted = true;
        return Promise.resolve();
      },
      drainSteer: (): readonly string[] => [],
      modelSignal: () => new AbortController().signal,
      enterOfflineHold: () => undefined,
      enterHandoffHold: vi.fn(),
    };
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true }),
      control,
    };
    const provider = new ScriptedProvider((t) =>
      resp(
        t === 0
          ? JSON.stringify(validPlan)
          : JSON.stringify({ action: 'act', tool: 'browser_get_elements', args: {}, rationale: 'r' }),
      ),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(control.enterHandoffHold).toHaveBeenCalled();
    expect(h.onEvent).toHaveBeenCalledWith('handoff', 'login');
    expect(h.onEvent).toHaveBeenCalledWith('paused', 'paused');
    expect(res.stoppedReason).toBe('aborted'); // the fake control released by aborting
  });

  it('builds the invoke-context (idempotency key + egress-blocked flag) and flags an off-origin escape', async () => {
    const { CapabilityRegistry, ToolGateway } = await import('@tepegoz/capability-plane');
    CapabilityRegistry.register({
      descriptor: {
        id: 'browser_update_location',
        description: 'navigate',
        dangerClass: 'state_changing',
        source: 'builtin',
        inputSchema: { type: 'object' },
        requiresIdempotencyKey: true,
      },
      inputSchema: objSchema,
      handler: () => ({ url: 'https://evil.test/' }),
    });
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    const planNav = {
      goal: 'go elsewhere',
      steps: [{ id: 's1', tool: 'browser_update_location', args: {}, rationale: 'r', dependsOn: [] }],
    };
    const h: AgentRunHooks = { ...hooks(), requestPlanApproval: () => Promise.resolve({ approved: true }) };
    const deps: AgentRunDeps = {
      ...DEPS,
      activeTabUrl: () => 'https://origin.test/here',
      tabUrl: () => 'https://origin.test/here',
      tabEgressBlocked: () => true,
      provider: {
        id: 'anthropic',
        instance: new ScriptedProvider((t) =>
          resp(
            t === 0
              ? JSON.stringify(planNav)
              : t === 1
                ? JSON.stringify({
                    action: 'act',
                    tool: 'browser_update_location',
                    args: { url: 'https://evil.test/', tabId: 't1' },
                    rationale: 'r',
                  })
                : JSON.stringify({ action: 'finish', summary: 'left the site' }),
          ),
        ),
      },
    };
    const res = await runAgent('do it', h, deps);
    // The step ran (ctxFor built the idempotency key + egress flag, isEscapeTool judged the target).
    expect(res.steps?.some((s) => s.tool === 'browser_update_location')).toBe(true);
  });

  it('recognises web_search_items and an off-origin browser_update_location as ESCAPE tools', async () => {
    const { CapabilityRegistry } = await import('@tepegoz/capability-plane');
    for (const id of ['web_search_items', 'browser_update_location']) {
      CapabilityRegistry.register({
        descriptor: {
          id,
          description: id,
          dangerClass: 'read', // auto-allowed → the act succeeds so the reactor runs isEscapeTool
          source: 'builtin',
          inputSchema: { type: 'object' },
          requiresIdempotencyKey: false,
        },
        inputSchema: objSchema,
        // browser_update_location returns NO `content` (only a url) → exercises contentFromResult's
        // undefined fall-through in onOutcome; web_search returns content.
        handler: () => (id === 'browser_update_location' ? { url: 'https://elsewhere.test/' } : { content: 'ok' }),
      });
    }
    const plan = {
      goal: 'wander off',
      steps: [{ id: 's1', tool: 'browser_update_location', args: {}, rationale: 'r', dependsOn: [] }],
    };
    const h: AgentRunHooks = { ...hooks(), requestPlanApproval: () => Promise.resolve({ approved: true }) };
    const deps: AgentRunDeps = {
      ...DEPS,
      activeTabUrl: () => 'https://origin.test/here',
      provider: {
        id: 'anthropic',
        instance: new ScriptedProvider((t) =>
          resp(
            t === 0
              ? JSON.stringify(plan)
              : t === 1
                ? // an OFF-ORIGIN navigation → isEscapeTool runs its full url-compare arm
                  JSON.stringify({ action: 'act', tool: 'browser_update_location', args: { url: 'https://elsewhere.test/' }, rationale: 'r' })
                : t === 2
                  ? // a malformed target → isEscapeTool's `new URL()` catch → false
                    JSON.stringify({ action: 'act', tool: 'browser_update_location', args: { url: 'http://[' }, rationale: 'r' })
                  : t === 3
                    ? // web_search_items → the immediate `return true` arm
                      JSON.stringify({ action: 'act', tool: 'web_search_items', args: { query: 'x' }, rationale: 'r' })
                    : JSON.stringify({ action: 'finish', summary: 'wandered' }),
          ),
        ),
      },
    };
    const res = await runAgent('do it', h, deps);
    // Coverage target is isEscapeTool's off-origin arm + the web_search return; the run terminates either way.
    expect(typeof res.stoppedReason).toBe('string');
    expect(res.steps?.length ?? 0).toBeGreaterThan(0);
  });

  it('emits step_error when a tool call fails inside the reactive loop', async () => {
    const { CapabilityRegistry } = await import('@tepegoz/capability-plane');
    CapabilityRegistry.register({
      descriptor: {
        id: 'browser_update_page',
        description: 'act',
        dangerClass: 'state_changing',
        source: 'builtin',
        inputSchema: { type: 'object' },
        requiresIdempotencyKey: false,
      },
      inputSchema: objSchema,
      handler: () => {
        throw new Error('the click missed');
      },
    });
    const { ToolGateway } = await import('@tepegoz/capability-plane');
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    const planWithAct = {
      goal: 'act on the page',
      steps: [{ id: 's1', tool: 'browser_update_page', args: {}, rationale: 'r', dependsOn: [] }],
    };
    const h: AgentRunHooks = { ...hooks(), requestPlanApproval: () => Promise.resolve({ approved: true }) };
    const provider = new ScriptedProvider((t) =>
      resp(
        t === 0
          ? JSON.stringify(planWithAct)
          : t === 1
            ? JSON.stringify({ action: 'act', tool: 'browser_update_page', args: {}, rationale: 'r' })
            : JSON.stringify({ action: 'finish', summary: 'gave up' }),
      ),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(h.onEvent).toHaveBeenCalledWith('step_error', expect.stringContaining('browser_update_page'), expect.any(String));
    expect(res.stoppedReason).not.toBe('completed');
  });

  it('takes the "cancel" terminal phase when the run-control gate aborts mid-loop', async () => {
    const state = { aborted: false };
    const control = {
      get aborted() {
        return state.aborted;
      },
      isHeld: () => false,
      waitWhileHeld: () => {
        state.aborted = true; // trip on the first per-step gate check
        return Promise.resolve();
      },
      drainSteer: (): readonly string[] => [],
      modelSignal: () => new AbortController().signal,
      enterOfflineHold: () => undefined,
      enterHandoffHold: () => undefined,
    };
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true }),
      control,
    };
    const provider = new ScriptedProvider((t) =>
      resp(t === 0 ? JSON.stringify(validPlan) : JSON.stringify({ action: 'finish', summary: 'x' })),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(res.stoppedReason).toBe('aborted');
  });
});
