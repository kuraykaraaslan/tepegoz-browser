import { describe, it, expect } from 'vitest';
import { ModelRouter, LOCAL_SLM_MODEL } from './model-router';
import { ANTHROPIC_MODEL, OPENAI_MODEL } from './models';

describe('ModelRouter.route — tier selection', () => {
  it('routes planning to the Opus tier at xhigh effort', () => {
    const d = ModelRouter.route({ capability: 'plan', costSaver: false });
    expect(d).toMatchObject({
      tier: 'plan',
      transport: 'cloud',
      provider: 'anthropic',
      model: ANTHROPIC_MODEL.plan,
      effort: 'xhigh',
      reason: 'plan_cloud',
    });
  });

  it('routes unknown/execution capabilities to the Sonnet tier at high effort', () => {
    const d = ModelRouter.route({ capability: 'browse', costSaver: false });
    expect(d).toMatchObject({
      tier: 'exec',
      model: ANTHROPIC_MODEL.exec,
      effort: 'high',
      reason: 'exec_cloud',
    });
  });

  it('routes simple capabilities to the Haiku tier at low effort', () => {
    const d = ModelRouter.route({ capability: 'classify', costSaver: false });
    expect(d).toMatchObject({
      tier: 'classify',
      model: ANTHROPIC_MODEL.classify,
      effort: 'low',
      reason: 'classify_cloud',
    });
  });
});

describe('ModelRouter.route — cost-saver offload', () => {
  it('falls back to cloud when cost-saver is on but no local SLM is available (Phase 1a no-op)', () => {
    const d = ModelRouter.route({
      capability: 'summarize',
      costSaver: true,
      localAvailable: false,
    });
    expect(d.transport).toBe('cloud');
    expect(d.model).toBe(ANTHROPIC_MODEL.classify);
    expect(d.reason).toBe('local_unavailable_cloud_fallback');
  });

  it('offloads a simple capability to the local SLM when cost-saver is on and local is available', () => {
    const d = ModelRouter.route({ capability: 'redact', costSaver: true, localAvailable: true });
    expect(d.transport).toBe('local');
    expect(d.model).toBe(LOCAL_SLM_MODEL);
    expect(d.reason).toBe('local_offload');
    expect(d.tier).toBe('classify');
  });

  it('reports the local offload as SERVED by the local provider regardless of the requested cloud one', () => {
    const d = ModelRouter.route({
      capability: 'summarize',
      costSaver: true,
      localAvailable: true,
      provider: 'openai',
    });
    expect(d.transport).toBe('local');
    expect(d.provider).toBe('local'); // not 'openai' — the decision names the actual serving provider
    expect(d.model).toBe(LOCAL_SLM_MODEL);
  });

  it('never offloads non-simple capabilities even with cost-saver + local available', () => {
    const plan = ModelRouter.route({ capability: 'plan', costSaver: true, localAvailable: true });
    expect(plan.transport).toBe('cloud');
    expect(plan.reason).toBe('plan_cloud');

    const exec = ModelRouter.route({
      capability: 'execute_step',
      costSaver: true,
      localAvailable: true,
    });
    expect(exec.transport).toBe('cloud');
    expect(exec.reason).toBe('exec_cloud');
  });
});

describe('ModelRouter.route — provider-specific model maps', () => {
  it('honors an explicit provider override and selects that provider tier map', () => {
    const d = ModelRouter.route({ capability: 'plan', costSaver: false, provider: 'openai' });
    expect(d.provider).toBe('openai');
    expect(d.model).toBe(OPENAI_MODEL.plan);
  });

  it('routes each OpenAI tier to its model', () => {
    expect(
      ModelRouter.route({ capability: 'browse', costSaver: false, provider: 'openai' }).model,
    ).toBe(OPENAI_MODEL.exec);
    expect(
      ModelRouter.route({ capability: 'classify', costSaver: false, provider: 'openai' }).model,
    ).toBe(OPENAI_MODEL.classify);
  });

  it('defaults to the Anthropic map when no provider is given', () => {
    expect(ModelRouter.route({ capability: 'plan', costSaver: false }).model).toBe(
      ANTHROPIC_MODEL.plan,
    );
  });
});
