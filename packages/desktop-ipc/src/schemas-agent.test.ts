import { describe, expect, it } from 'vitest';
import {
  AgentApprovalResponseSchema,
  AgentExportBundleSchema,
  AgentExportConversationSchema,
  AgentNewConversationSchema,
  AgentOpenFileSchema,
  AgentPlanResponseSchema,
  AgentRunIdSchema,
  AgentRunInputSchema,
  AgentSkillIdSchema,
  AgentSkillSaveSchema,
  AgentSteerSchema,
  HistoryPageParamsSchema,
  HistoryQuerySchema,
  HistorySearchParamsSchema,
  HistoryUrlSchema,
} from './schemas-agent';

/**
 * Runtime (zod) guards for the `agent:*` + history IPC channels. The load-bearing bits: the run
 * prompt is bounded by the ASSEMBLED-prompt cap (not the user-text cap), `skillId`/skill ids are
 * UUIDs, and the history param schemas apply DEFAULTS so an empty payload still yields a full query.
 */

const UUID = '00000000-0000-4000-8000-000000000000';

describe('AgentRunInputSchema', () => {
  it('accepts prompt + groupId, with the optional meta fields', () => {
    expect(AgentRunInputSchema.parse({ prompt: 'go', groupId: 'g1' })).toMatchObject({
      prompt: 'go',
    });
    expect(
      AgentRunInputSchema.parse({
        prompt: 'go',
        groupId: 'g1',
        displayPrompt: 'go please',
        skillId: UUID,
        attachmentMeta: [{ kind: 'selection', label: 'sel' }],
      }),
    ).toMatchObject({ skillId: UUID });
  });

  it('rejects an empty prompt, a bad skillId, and an unknown attachment kind', () => {
    expect(AgentRunInputSchema.safeParse({ prompt: '', groupId: 'g1' }).success).toBe(false);
    expect(AgentRunInputSchema.safeParse({ prompt: 'x', groupId: 'g1', skillId: 'nope' }).success).toBe(
      false,
    );
    expect(
      AgentRunInputSchema.safeParse({
        prompt: 'x',
        groupId: 'g1',
        attachmentMeta: [{ kind: 'video', label: 'v' }],
      }).success,
    ).toBe(false);
  });
});

describe('the small id / message schemas', () => {
  it('AgentNewConversationSchema / AgentRunIdSchema are bounded strings', () => {
    expect(AgentNewConversationSchema.parse('g1')).toBe('g1');
    expect(AgentRunIdSchema.parse('r1')).toBe('r1');
    expect(AgentNewConversationSchema.safeParse('').success).toBe(false);
  });

  it('AgentSteerSchema needs runId + non-empty text', () => {
    expect(AgentSteerSchema.parse({ runId: 'r1', text: 'try again' })).toMatchObject({ runId: 'r1' });
    expect(AgentSteerSchema.safeParse({ runId: 'r1', text: '' }).success).toBe(false);
  });

  it('AgentOpenFileSchema is a bounded path string', () => {
    expect(AgentOpenFileSchema.parse('/tmp/out.pdf')).toBe('/tmp/out.pdf');
    expect(AgentOpenFileSchema.safeParse('').success).toBe(false);
  });
});

describe('the HITL response schemas', () => {
  it('AgentApprovalResponseSchema — approvalId + approved, remember/grantScope optional', () => {
    expect(AgentApprovalResponseSchema.parse({ approvalId: 'a1', approved: true })).toMatchObject({
      approved: true,
    });
    expect(
      AgentApprovalResponseSchema.parse({
        approvalId: 'a1',
        approved: false,
        remember: true,
        grantScope: true,
      }),
    ).toMatchObject({ grantScope: true });
    expect(AgentApprovalResponseSchema.safeParse({ approvalId: 'a1' }).success).toBe(false);
  });

  it('AgentPlanResponseSchema — planId + approved, skipStepIds capped at 100', () => {
    expect(AgentPlanResponseSchema.parse({ planId: 'p1', approved: true })).toMatchObject({
      planId: 'p1',
    });
    expect(
      AgentPlanResponseSchema.safeParse({
        planId: 'p1',
        approved: true,
        skipStepIds: Array.from({ length: 101 }, () => 's'),
      }).success,
    ).toBe(false);
  });
});

describe('the export schemas', () => {
  it('AgentExportConversationSchema — content required, title optional', () => {
    expect(AgentExportConversationSchema.parse({ content: 'log' })).toEqual({ content: 'log' });
    expect(AgentExportConversationSchema.safeParse({ content: '' }).success).toBe(false);
  });

  it('AgentExportBundleSchema — chatContent + groupId, deep optional meta', () => {
    expect(
      AgentExportBundleSchema.parse({
        chatContent: 'log',
        groupId: 'g1',
        meta: { provider: 'anthropic', tokens: { totalTokens: 5 } },
      }),
    ).toMatchObject({ groupId: 'g1' });
    expect(AgentExportBundleSchema.safeParse({ chatContent: 'log' }).success).toBe(false);
  });
});

describe('the history query schemas apply defaults', () => {
  it('HistoryPageParamsSchema / HistorySearchParamsSchema fill in from an empty object', () => {
    expect(HistoryPageParamsSchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(HistorySearchParamsSchema.parse({})).toEqual({
      query: '',
      limit: 50,
      offset: 0,
      forOmnibox: false,
    });
    expect(HistoryPageParamsSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('HistoryQuerySchema / HistoryUrlSchema are bounded strings', () => {
    expect(HistoryQuerySchema.parse('term')).toBe('term');
    expect(HistoryUrlSchema.parse('https://x.test')).toBe('https://x.test');
    expect(HistoryUrlSchema.safeParse('').success).toBe(false);
  });
});

describe('the agent-skill schemas', () => {
  it('AgentSkillSaveSchema — name + prompt required, id (when present) a UUID', () => {
    expect(AgentSkillSaveSchema.parse({ name: 'S', prompt: 'do it' })).toMatchObject({ name: 'S' });
    expect(AgentSkillSaveSchema.parse({ id: UUID, name: 'S', prompt: 'x' })).toMatchObject({
      id: UUID,
    });
    expect(AgentSkillSaveSchema.safeParse({ id: 'not-a-uuid', name: 'S', prompt: 'x' }).success).toBe(
      false,
    );
  });

  it('AgentSkillIdSchema is a bare UUID', () => {
    expect(AgentSkillIdSchema.parse(UUID)).toBe(UUID);
    expect(AgentSkillIdSchema.safeParse('s1').success).toBe(false);
  });
});
