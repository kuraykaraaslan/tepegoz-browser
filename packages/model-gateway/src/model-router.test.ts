import { describe, it, expect } from 'vitest';
import { ModelRouter, LOCAL_SLM_MODEL } from './model-router';
import { ANTHROPIC_MODEL } from './models';

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
    expect(d).toMatchObject({ tier: 'exec', model: ANTHROPIC_MODEL.exec, effort: 'high', reason: 'exec_cloud' });
  });

  it('routes simple capabilities to the Haiku tier at low effort', () => {
    const d = ModelRouter.route({ capability: 'classify', costSaver: false });
    expect(d).toMatchObject({ tier: 'classify', model: ANTHROPIC_MODEL.classify, effort: 'low', reason: 'classify_cloud' });
  });
});

describe('ModelRouter.route — cost-saver offload', () => {
  it('falls back to cloud when cost-saver is on but no local SLM is available (Phase 1a no-op)', () => {
    const d = ModelRouter.route({ capability: 'summarize', costSaver: true, localAvailable: false });
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

  it('never offloads non-simple capabilities even with cost-saver + local available', () => {
    const plan = ModelRouter.route({ capability: 'plan', costSaver: true, localAvailable: true });
    expect(plan.transport).toBe('cloud');
    expect(plan.reason).toBe('plan_cloud');

    const exec = ModelRouter.route({ capability: 'execute_step', costSaver: true, localAvailable: true });
    expect(exec.transport).toBe('cloud');
    expect(exec.reason).toBe('exec_cloud');
  });
});

describe('ModelRouter.route — provider passthrough', () => {
  it('honors an explicit provider override', () => {
    const d = ModelRouter.route({ capability: 'plan', costSaver: false, provider: 'openai' });
    expect(d.provider).toBe('openai');
  });
});
