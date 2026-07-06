import { z } from 'zod';
import {
  AGENT_CONVERSATION_STATUSES,
  AGENT_HISTORY_EVENT_KINDS,
  type AgentConversationListInput,
  type AgentConversationOpenInput,
} from './index';

export const AgentConversationListInputSchema: z.ZodType<AgentConversationListInput> = z.object({
  query: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const AgentConversationIdSchema = z.string().min(1).max(128);

export const AgentConversationOpenInputSchema: z.ZodType<AgentConversationOpenInput> = z.object({
  id: AgentConversationIdSchema,
  groupId: z.string().min(1).max(64),
});

export const AgentHistoryEventSchema = z.object({
  runId: z.string().min(1).max(128),
  groupId: z.string().min(1).max(64),
  kind: z.enum(AGENT_HISTORY_EVENT_KINDS),
  message: z.string().max(20_000),
  detail: z.string().max(20_000).optional(),
  ts: z.number().int().nonnegative(),
});

export const AgentConversationStatusSchema = z.enum(AGENT_CONVERSATION_STATUSES);
