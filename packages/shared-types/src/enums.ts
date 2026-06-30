import { z } from 'zod';

/**
 * Runtime-validated enums (internal-ai-rules: z.enum, not TS enum, for anything validated at runtime).
 * Each yields both a runtime validator and a z.infer type.
 */

export const AIProviderEnum = z.enum(['anthropic', 'openai', 'gemini']);
export type AIProvider = z.infer<typeof AIProviderEnum>;

export const PolicyDecisionEnum = z.enum(['allow', 'deny', 'ask']);
export type PolicyDecision = z.infer<typeof PolicyDecisionEnum>;

export const HITLStatusEnum = z.enum(['pending', 'approved', 'rejected', 'timed_out']);
export type HITLStatus = z.infer<typeof HITLStatusEnum>;

/** Tool danger class — drives Policy Kernel HITL gating (plan §5.5/§13). */
export const RiskLevelEnum = z.enum(['read', 'state_changing', 'destructive', 'financial']);
export type RiskLevel = z.infer<typeof RiskLevelEnum>;

export const McpTransportEnum = z.enum(['stdio', 'http_sse']);
export type McpTransport = z.infer<typeof McpTransportEnum>;

/** Event Journal record types — phrased as "things that happened" (event-sourcing). */
export const EventTypeEnum = z.enum([
  'SessionStarted',
  'TabOpened',
  'AgentStepExecuted',
  'ToolInvoked',
  'PolicyBlocked',
  'HitlRequested',
  'HitlResolved',
  'CheckpointWritten',
  'TaskSucceeded',
  'TaskFailed',
]);
export type EventType = z.infer<typeof EventTypeEnum>;
