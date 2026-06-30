import { describe, it, expect, beforeEach } from 'vitest';
import { ModelGateway, MockProvider } from '@tepegoz/model-gateway';
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
});
