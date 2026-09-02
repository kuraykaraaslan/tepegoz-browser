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
import { WEB_PERMISSION_CAPABILITIES } from './web-permissions';

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

/**
 * The LLM/cognitive work class an action's reasoning maps to — the axis that decides whether the
 * on-device (local) model can do it. `'none'` = a purely mechanical action (click/navigate/create
 * tab) with no AI step, so it is never "run locally"-toggleable. The others mirror the model
 * gateway's SIMPLE_CAPABILITIES plus the two heavy tiers (`plan`/`decide`). Author-declared on each
 * tool descriptor; absent ⇒ treated as `none` (fail-safe).
 */
export const AiTaskEnum = z.enum([
  'none',
  'read_understand',
  'summarize',
  'classify',
  'extract',
  'redact',
  'plan',
  'decide',
]);
export type AiTask = z.infer<typeof AiTaskEnum>;

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

/** Per-site brokered web capability — built FROM the canonical list in `web-permissions.ts`. */
export const WebPermissionCapabilityEnum = z.enum(WEB_PERMISSION_CAPABILITIES);

/** Event Journal record types — phrased as "things that happened" (event-sourcing). */
export const EventTypeEnum = z.enum([
  'SessionStarted',
  'SessionSnapshotWritten',
  'TabOpened',
  'AgentStepExecuted',
  'ToolInvoked',
  'PolicyBlocked',
  'HitlRequested',
  'HitlResolved',
  'HandoffRequested',
  'CheckpointWritten',
  'DownloadStarted',
  'DownloadProgressed',
  'DownloadQuarantined',
  'DownloadReleased',
  'DownloadBlocked',
  'DownloadCanceled',
  'DownloadFailed',
  'ClipboardAccessed',
  'SiteDataCleared',
  // Transport-security and identity decisions the USER made against the browser's own safe default.
  // Only the weakening choice is recorded: proceeding past a bad server certificate, and actually
  // sending a client certificate. A refusal restores the default and leaves nothing to audit.
  'CertificateErrorProceeded',
  'ClientCertificateSent',
  'UploadStaged',
  'UploadBound',
  'UploadSubmitting',
  'UploadCompleted',
  'UploadCanceled',
  'UploadFailed',
  'UploadCleared',
  'TaskQueued',
  'TaskStarted',
  'TaskAwaitingApproval',
  'TaskCanceled',
  'TaskArtifactCreated',
  'TaskSucceeded',
  'TaskFailed',
]);
export type EventType = z.infer<typeof EventTypeEnum>;
