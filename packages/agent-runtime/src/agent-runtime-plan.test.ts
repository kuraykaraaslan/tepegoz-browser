import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgent, type AgentRunHooks } from './agent-runtime';
import {
  DEPS,
  ScriptedProvider,
  initStores,
  inject,
  installReadTool,
  makeHooks,
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

describe('runAgent — plan phase, approval, and egress-during-planning', () => {
  beforeEach(() => {
    installReadTool(() => ({ content: 'els' }));
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
    expect(h.onEvent).toHaveBeenCalledWith(
      'plan',
      expect.stringContaining('1 step'),
      expect.any(String),
    );
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

  it('surfaces an Egress WARNING to the Console when the prompt carries PII (email), then still sends', async () => {
    const h = hooks(); // default plan approval → { approved: false }
    const provider = new ScriptedProvider(() => resp(JSON.stringify(validPlan)));
    const res = await runAgent(
      'mail the report to alice@example.com when done',
      h,
      inject(provider),
    );
    expect(res.stoppedReason).toBe('plan_rejected'); // the warn is advisory — the request went out
    expect(h.onEvent).toHaveBeenCalledWith(
      'decision',
      DEPS.runtimeStrings.egressWarning,
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
});
