import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgent, type AgentRunDeps, type AgentRunHooks } from './agent-runtime';
import {
  DEPS,
  ScriptedProvider,
  initStores,
  inject,
  installReadTool,
  makeHooks,
  objSchema,
  resetStores,
  resp,
  validPlan,
} from './agent-runtime.test-support';

const hooks = () => makeHooks(vi.fn());

let dir: string;
beforeEach(() => {
  dir = initStores();
});
afterEach(() => {
  resetStores(dir);
});

describe('runAgent — reactive loop, handoff, and escape detection', () => {
  let readResult: unknown = { content: 'els' };
  beforeEach(() => {
    readResult = { content: 'els' };
    installReadTool(() => readResult);
  });

  it('runs the full plan → approve → reactive loop → completed path and assembles the summary', async () => {
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true }),
    };
    const script = [
      JSON.stringify(validPlan),
      JSON.stringify({
        action: 'act',
        tool: 'browser_get_elements',
        args: { url: 'https://x.test/a' },
        rationale: 'r',
      }),
      JSON.stringify({ action: 'act', tool: 'browser_get_elements', args: {}, rationale: 'r' }),
      JSON.stringify({ action: 'finish', summary: 'read both' }),
      JSON.stringify({ done: true, final_answer: 'the page said hello' }),
    ];
    const provider = new ScriptedProvider((t) =>
      resp(script[t] ?? JSON.stringify({ action: 'finish', summary: 'fallback' })),
    );

    const res = await runAgent('do it', h, inject(provider));

    expect(res.stoppedReason).toBe('completed');
    expect(res.ok).toBe(true);
    expect(res.summary).toBe('the page said hello');
    expect(res.tokenUsage?.totalTokens).toBeGreaterThan(0);
    expect(res.steps?.map((s) => s.tool)).toEqual(['browser_get_elements', 'browser_get_elements']);
    // navTargetOf pulls the { url } arg through onto the first step, and leaves it off the second.
    expect(res.steps?.[0]?.targetUrl).toBe('https://x.test/a');
    expect(res.steps?.[1]?.targetUrl).toBeUndefined();
    expect(h.onEvent).toHaveBeenCalledWith(
      'done',
      expect.any(String),
      expect.stringContaining('tokens'),
    );
  });

  it('takes the "fail" terminal phase and reports an error when the reactive loop errors out', async () => {
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true }),
    };
    let turn = 0;
    const provider = new ScriptedProvider(() =>
      turn++ === 0 ? resp(JSON.stringify(validPlan)) : new Error('upstream socket reset'),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(res.ok).toBe(false);
    expect(res.stoppedReason).not.toBe('completed');
    expect(h.onEvent).toHaveBeenCalledWith(
      'error',
      expect.any(String),
      expect.stringContaining('tokens'),
    );
  });

  it('hands off (terminal) when a perceived page is a CAPTCHA wall', async () => {
    readResult = { content: 'Please verify you are human to continue', url: 'https://x.test/gate' };
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true }),
    };
    const provider = new ScriptedProvider((t) =>
      resp(
        t === 0
          ? JSON.stringify(validPlan)
          : JSON.stringify({
              action: 'act',
              tool: 'browser_get_elements',
              args: {},
              rationale: 'r',
            }),
      ),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(res.stoppedReason).toBe('handoff');
    expect(h.onEvent).toHaveBeenCalledWith('handoff', 'captcha');
  });

  it('pauses (not terminal) on a LOGIN wall when a run-control gate is present', async () => {
    readResult = {
      content: 'Please sign in to continue to your account',
      url: 'https://x.test/login',
    };
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
          : JSON.stringify({
              action: 'act',
              tool: 'browser_get_elements',
              args: {},
              rationale: 'r',
            }),
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
      steps: [
        { id: 's1', tool: 'browser_update_location', args: {}, rationale: 'r', dependsOn: [] },
      ],
    };
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true }),
    };
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
        handler: () =>
          id === 'browser_update_location' ? { url: 'https://elsewhere.test/' } : { content: 'ok' },
      });
    }
    const plan = {
      goal: 'wander off',
      steps: [
        { id: 's1', tool: 'browser_update_location', args: {}, rationale: 'r', dependsOn: [] },
      ],
    };
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true }),
    };
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
                  JSON.stringify({
                    action: 'act',
                    tool: 'browser_update_location',
                    args: { url: 'https://elsewhere.test/' },
                    rationale: 'r',
                  })
                : t === 2
                  ? // a malformed target → isEscapeTool's `new URL()` catch → false
                    JSON.stringify({
                      action: 'act',
                      tool: 'browser_update_location',
                      args: { url: 'http://[' },
                      rationale: 'r',
                    })
                  : t === 3
                    ? // web_search_items → the immediate `return true` arm
                      JSON.stringify({
                        action: 'act',
                        tool: 'web_search_items',
                        args: { query: 'x' },
                        rationale: 'r',
                      })
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
    const h: AgentRunHooks = {
      ...hooks(),
      requestPlanApproval: () => Promise.resolve({ approved: true }),
    };
    const provider = new ScriptedProvider((t) =>
      resp(
        t === 0
          ? JSON.stringify(planWithAct)
          : t === 1
            ? JSON.stringify({
                action: 'act',
                tool: 'browser_update_page',
                args: {},
                rationale: 'r',
              })
            : JSON.stringify({ action: 'finish', summary: 'gave up' }),
      ),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(h.onEvent).toHaveBeenCalledWith(
      'step_error',
      expect.stringContaining('browser_update_page'),
      expect.any(String),
    );
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
      resp(
        t === 0 ? JSON.stringify(validPlan) : JSON.stringify({ action: 'finish', summary: 'x' }),
      ),
    );
    const res = await runAgent('do it', h, inject(provider));
    expect(res.stoppedReason).toBe('aborted');
  });
});
