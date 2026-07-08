import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelGateway,
  MockProvider,
  type CanonRequest,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import Planner from './planner';

const tools: Pick<ToolDescriptor, 'id' | 'description' | 'dangerClass'>[] = [
  { id: 'browser_get_page', description: 'read the current page', dangerClass: 'read' },
];

function req(reply: string) {
  ModelGateway.reset();
  ModelGateway.register(new MockProvider(reply));
  return { intent: 'summarize the page', tools, provider: 'anthropic' as const, model: 'claude-opus-4-8' };
}

const validPlan = {
  goal: 'summarize',
  steps: [{ id: 's1', tool: 'browser_get_page', args: {}, rationale: 'read it', dependsOn: [] }],
};

beforeEach(() => {
  ModelGateway.reset();
});

describe('Planner.plan', () => {
  it('parses a JSON plan from the model', async () => {
    const plan = await Planner.plan(req(JSON.stringify(validPlan)));
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.tool).toBe('browser_get_page');
  });

  it('tolerates markdown code fences around the JSON', async () => {
    const plan = await Planner.plan(req('```json\n' + JSON.stringify(validPlan) + '\n```'));
    expect(plan.steps[0]?.tool).toBe('browser_get_page');
  });

  it('rejects non-JSON output', async () => {
    await expect(Planner.plan(req('I cannot do that'))).rejects.toThrow(/JSON/);
  });

  it('rejects a plan that references an unregistered tool', async () => {
    const evil = { goal: '', steps: [{ id: 's1', tool: 'secret_get_files', args: {}, rationale: '', dependsOn: [] }] };
    await expect(Planner.plan(req(JSON.stringify(evil)))).rejects.toThrow(/unknown tool/);
  });

  it('adds the coreference instruction to the plan prompt ONLY when history is present', async () => {
    /** Captures the system prompt the planner sends and returns a valid plan so plan() resolves. */
    class CapturingProvider implements ModelProvider {
      readonly id = 'anthropic' as const;
      system = '';
      complete(request: CanonRequest): Promise<CanonResponse> {
        this.system = request.messages.find((m) => m.role === 'system')?.content ?? '';
        return Promise.resolve({
          text: JSON.stringify(validPlan),
          stopReason: 'end',
          usage: { inputTokens: 1, outputTokens: 1 },
          toolCalls: [],
        });
      }
    }
    const base = { intent: 'summarize the page', tools, provider: 'anthropic' as const, model: 'claude-opus-4-8' };

    const withHistory = new CapturingProvider();
    ModelGateway.reset();
    ModelGateway.register(withHistory);
    await Planner.plan({
      ...base,
      history: [
        { role: 'user', content: 'Atatürk' },
        { role: 'assistant', content: 'searched Atatürk' },
      ],
    });
    expect(withHistory.system).toContain('earlier turns of the SAME conversation');

    const withoutHistory = new CapturingProvider();
    ModelGateway.reset();
    ModelGateway.register(withoutHistory);
    await Planner.plan(base);
    expect(withoutHistory.system).not.toContain('earlier turns of the SAME conversation');
  });

  it('guides opening menus/drawers and trying a conventional URL path', async () => {
    class CapturingProvider implements ModelProvider {
      readonly id = 'anthropic' as const;
      system = '';
      complete(request: CanonRequest): Promise<CanonResponse> {
        this.system = request.messages.find((m) => m.role === 'system')?.content ?? '';
        return Promise.resolve({
          text: JSON.stringify(validPlan),
          stopReason: 'end',
          usage: { inputTokens: 1, outputTokens: 1 },
          toolCalls: [],
        });
      }
    }
    const provider = new CapturingProvider();
    ModelGateway.reset();
    ModelGateway.register(provider);
    await Planner.plan({ intent: 'find the blog', tools, provider: 'anthropic' as const, model: 'claude-opus-4-8' });
    expect(provider.system).toContain('menu/hamburger');
    expect(provider.system).toContain('/blog');
  });
});

function vreq(reply: string) {
  ModelGateway.reset();
  ModelGateway.register(new MockProvider(reply));
  return {
    goal: 'find and open the blog',
    memory: 'opened the menu',
    recentObservations: ['Latest post: Hello World'],
    provider: 'anthropic' as const,
    model: 'claude-opus-4-8',
  };
}

describe('Planner.validateCompletion (completion authority, untrusted boundary)', () => {
  it('parses a done verdict with the authoritative final answer', async () => {
    const v = await Planner.validateCompletion(vreq(JSON.stringify({ done: true, final_answer: 'Latest post: Hello World' })));
    expect(v).toEqual({ done: true, finalAnswer: 'Latest post: Hello World' });
  });

  it('parses a not-done verdict carrying the remaining-work reason', async () => {
    const v = await Planner.validateCompletion(vreq(JSON.stringify({ done: false, reason: 'the blog page was never opened' })));
    expect(v).toEqual({ done: false, reason: 'the blog page was never opened' });
  });

  it('rejects non-JSON output', async () => {
    await expect(Planner.validateCompletion(vreq('I think it is done'))).rejects.toThrow(/JSON/);
  });

  it('rejects a verdict missing the done boolean (malformed shape)', async () => {
    await expect(Planner.validateCompletion(vreq(JSON.stringify({ final_answer: 'x' })))).rejects.toThrow(/malformed/i);
  });
});

describe('Planner security preamble (AI-5)', () => {
  class SysCapture implements ModelProvider {
    readonly id = 'anthropic' as const;
    system = '';
    complete(request: CanonRequest): Promise<CanonResponse> {
      this.system = request.messages.find((m) => m.role === 'system')?.content ?? '';
      return Promise.resolve({ text: JSON.stringify(validPlan), stopReason: 'end', usage: { inputTokens: 1, outputTokens: 1 }, toolCalls: [] });
    }
  }

  it('prepends the security preamble to the plan prompt', async () => {
    const provider = new SysCapture();
    ModelGateway.reset();
    ModelGateway.register(provider);
    await Planner.plan({ intent: 'summarize', tools, provider: 'anthropic' as const, model: 'claude-opus-4-8' });
    expect(provider.system).toContain('UNTRUSTED DATA');
  });
});
