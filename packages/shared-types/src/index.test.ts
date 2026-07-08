import { describe, it, expect } from 'vitest';
import {
  EventSchema,
  AIProviderEnum,
  PlanSchema,
  PlanStepSchema,
  ToolNameSchema,
  ToolDescriptorSchema,
  ADAPTOR_KINDS,
  ADAPTOR_PERMISSION_STATES,
  ToolSuccessSchema,
  toolSuccess,
  EvalScenarioSchema,
  EvalScenarioFileSchema,
} from './index';

describe('shared-types contracts', () => {
  it('accepts a well-formed Event Journal record', () => {
    const res = EventSchema.safeParse({
      lsn: 0,
      id: '00000000-0000-4000-8000-000000000000',
      type: 'SessionStarted',
      ts: 1,
      actor: 'system',
      correlationId: 'run-1',
      payload: {},
      redacted: true,
      deviceId: 'device-1',
    });
    expect(res.success).toBe(true);
  });

  it('rejects an unknown AI provider', () => {
    expect(AIProviderEnum.safeParse('grok').success).toBe(false);
  });

  it('enforces {domain}_{verb}_{noun} tool naming', () => {
    expect(ToolNameSchema.safeParse('browser_get_page').success).toBe(true);
    expect(ToolNameSchema.safeParse('do_thing').success).toBe(false);
    expect(ToolNameSchema.safeParse('browser_frobnicate_page').success).toBe(false);
  });

  it('caps plan goal and step rationale lengths (untrusted planner output)', () => {
    const step = { id: 's1', tool: 'browser_get_page', args: {} };
    expect(PlanStepSchema.safeParse({ ...step, rationale: 'r'.repeat(500) }).success).toBe(true);
    expect(PlanStepSchema.safeParse({ ...step, rationale: 'r'.repeat(501) }).success).toBe(false);
    expect(PlanSchema.safeParse({ goal: 'g'.repeat(1000), steps: [] }).success).toBe(true);
    expect(PlanSchema.safeParse({ goal: 'g'.repeat(1001), steps: [] }).success).toBe(false);
  });

  it('defaults requiresIdempotencyKey to false', () => {
    const res = ToolDescriptorSchema.safeParse({
      id: 'tab_list_items',
      description: 'List open tabs',
      dangerClass: 'read',
      source: 'builtin',
      inputSchema: {},
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.requiresIdempotencyKey).toBe(false);
  });

  it('exports adaptor kinds and permission states for connection inventory', () => {
    expect(ADAPTOR_KINDS).toContain('mcp');
    expect(ADAPTOR_KINDS).toContain('graphql');
    expect(ADAPTOR_PERMISSION_STATES).toContain('not_configured');
    expect(ADAPTOR_PERMISSION_STATES).toContain('connected');
  });
});

describe('eval scenario contract (AI-1)', () => {
  const base = {
    id: 'blog_behind_menu',
    task: 'Open the blog and read the latest post title.',
    target: { fixture: 'blog-behind-nav' },
    success: { domAssertion: 'Latest post' },
  };

  it('accepts a fixture-targeted scenario and defaults heldOut/tags', () => {
    const res = EvalScenarioSchema.safeParse(base);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.heldOut).toBe(false);
      expect(res.data.tags).toEqual([]);
    }
  });

  it('accepts a realUrl target but rejects a non-URL one', () => {
    expect(
      EvalScenarioSchema.safeParse({ ...base, target: { realUrl: 'https://example.com' } }).success,
    ).toBe(true);
    expect(EvalScenarioSchema.safeParse({ ...base, target: { realUrl: 'not-a-url' } }).success).toBe(false);
  });

  it('requires a non-empty id and task (untrusted registry input)', () => {
    expect(EvalScenarioSchema.safeParse({ ...base, id: '' }).success).toBe(false);
    expect(EvalScenarioSchema.safeParse({ ...base, task: '' }).success).toBe(false);
  });

  it('validates a registry file of many scenarios', () => {
    const res = EvalScenarioFileSchema.safeParse({ scenarios: [base, { ...base, id: 'other' }] });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.scenarios).toHaveLength(2);
  });
});

describe('tool result contract', () => {
  it('normalizes a success envelope with summary, artifacts and page refs', () => {
    const result = toolSuccess('Fetched page', {
      content: { title: 'Example' },
      pageRefs: [{ url: 'https://example.com', title: 'Example' }],
      artifacts: [{ id: 'a1', kind: 'link', title: 'Example', url: 'https://example.com' }],
    });
    const parsed = ToolSuccessSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.summary).toBe('Fetched page');
  });
});
