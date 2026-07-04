import { z } from 'zod';
import { AI_PROVIDERS } from './providers';
import {
  NOTIFICATION_ACTION_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  NOTIFICATION_SOURCES,
  SITE_PERMISSION_STATES,
} from './notifications';
import { COMPARE_OPS, SELECTOR_KINDS, STEP_ERROR_POLICIES, STEP_KINDS } from './macro-ir';

/**
 * Runtime-validated enums (internal-ai-rules: z.enum, not TS enum, for anything validated at runtime).
 * Each yields both a runtime validator and a z.infer type.
 */

/** Built FROM the canonical zod-free list in providers.ts (the `AIProvider` type lives there too). */
export const AIProviderEnum = z.enum(AI_PROVIDERS);

export const PolicyDecisionEnum = z.enum(['allow', 'deny', 'ask']);
export type PolicyDecision = z.infer<typeof PolicyDecisionEnum>;

export const HITLStatusEnum = z.enum(['pending', 'approved', 'rejected', 'timed_out']);
export type HITLStatus = z.infer<typeof HITLStatusEnum>;

/** Tool danger class — drives Policy Kernel HITL gating (plan §5.5/§13). */
export const RiskLevelEnum = z.enum(['read', 'state_changing', 'destructive', 'financial']);
export type RiskLevel = z.infer<typeof RiskLevelEnum>;

export const McpTransportEnum = z.enum(['stdio', 'http_sse']);
export type McpTransport = z.infer<typeof McpTransportEnum>;

/** Macro IR enums — built FROM the canonical zod-free lists in macro-ir.ts (single source). */
export const SelectorKindEnum = z.enum(SELECTOR_KINDS);
export const CompareOpEnum = z.enum(COMPARE_OPS);
export const StepKindEnum = z.enum(STEP_KINDS);
export const StepErrorPolicyEnum = z.enum(STEP_ERROR_POLICIES);

/** Notification enums — built FROM the canonical zod-free lists in notifications.ts (single source). */
export const NotificationKindEnum = z.enum(NOTIFICATION_KINDS);
export const NotificationSourceEnum = z.enum(NOTIFICATION_SOURCES);
export const NotificationChannelEnum = z.enum(NOTIFICATION_CHANNELS);
export const NotificationActionTypeEnum = z.enum(NOTIFICATION_ACTION_TYPES);
export const SitePermissionStateEnum = z.enum(SITE_PERMISSION_STATES);

/** Event Journal record types — phrased as "things that happened" (event-sourcing). */
export const EventTypeEnum = z.enum([
  'SessionStarted',
  'TabOpened',
  'AgentStepExecuted',
  'ToolInvoked',
  'PolicyBlocked',
  'HitlRequested',
  'HitlResolved',
  'HandoffRequested',
  'CheckpointWritten',
  'TaskSucceeded',
  'TaskFailed',
]);
export type EventType = z.infer<typeof EventTypeEnum>;
