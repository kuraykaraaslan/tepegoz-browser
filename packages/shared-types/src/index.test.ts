import { describe, it, expect } from 'vitest';
import {
  EventSchema,
  AIProviderEnum,
  PlanSchema,
  PlanStepSchema,
  ToolNameSchema,
  ToolDescriptorSchema,
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
});
