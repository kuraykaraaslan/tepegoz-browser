/**
 * Pure helpers that turn a user's high-level intent (an agent conversation + a schedule preset) into a
 * {@link TaskSaveInput}. No React, no Electron — shared by every entry point (the agent panel's "Save as
 * scheduled task" modal and the tasks manager's "New task from conversation" picker) so the mapping lives
 * in exactly one place. Policy is left to the host to synthesize from an autonomy preset (it needs the
 * live tool registry); everything else is decided here.
 */
import {
  MIN_TASK_INTERVAL_MINUTES,
  defaultTaskPolicy,
  normalizeIntervalMinutes,
  type TaskAutonomyPreset,
  type TaskPageChangeMode,
  type TaskPolicy,
  type TaskSaveInput,
  type TaskTrigger,
} from './tasks.model';

/** The three schedule shapes offered when converting a chat: "sürekli / belli aralıklarla / sayfa güncellenirse". */
export const SCHEDULE_PRESETS = ['continuous', 'interval', 'pageChange'] as const;
export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];

/** Default cadence (minutes) for the plain `interval` preset when the user hasn't picked one. */
export const DEFAULT_INTERVAL_MINUTES = 15;

export interface PresetTriggerOptions {
  everyMinutes?: number | undefined;
  url?: string | undefined;
  selector?: string | undefined;
  changeMode?: TaskPageChangeMode | undefined;
}

/**
 * Map a schedule preset to a concrete non-manual {@link TaskTrigger}. `continuous` is honestly the engine
 * floor (every {@link MIN_TASK_INTERVAL_MINUTES} minutes) — there is no sub-5-minute or always-on mode.
 */
export function presetToTrigger(
  preset: SchedulePreset,
  opts: PresetTriggerOptions = {},
): TaskTrigger {
  if (preset === 'continuous') {
    return { type: 'interval', enabled: true, everyMinutes: MIN_TASK_INTERVAL_MINUTES };
  }
  if (preset === 'interval') {
    return {
      type: 'interval',
      enabled: true,
      everyMinutes: normalizeIntervalMinutes(opts.everyMinutes ?? DEFAULT_INTERVAL_MINUTES),
    };
  }
  return {
    type: 'pageChange',
    enabled: true,
    url: opts.url ?? '',
    ...(opts.selector !== undefined && opts.selector.trim().length > 0
      ? { selector: opts.selector.trim() }
      : {}),
    everyMinutes: normalizeIntervalMinutes(opts.everyMinutes ?? DEFAULT_INTERVAL_MINUTES),
    changeMode: opts.changeMode ?? 'textHash',
    fireOnFirstCheck: false,
  };
}

export interface PolicySynthesisContext {
  targetOrigin?: string | undefined;
  /** Write-class tool ids to pre-approve (enumerated from the live CapabilityRegistry by the host). */
  writeToolIds?: readonly string[] | undefined;
}

/**
 * Build a concrete {@link TaskPolicy} from an autonomy preset. `notify` = the safe default (empty
 * allowlists → the run pauses and notifies before any write). `sameOriginWrites` = pre-approve the given
 * write tools, but only on the task's own target origin (both must match in `taskPolicyPreapproves`).
 */
export function synthesizePolicy(
  preset: TaskAutonomyPreset,
  ctx: PolicySynthesisContext = {},
): TaskPolicy {
  const base = defaultTaskPolicy();
  if (preset === 'notify') return base;
  const origin =
    ctx.targetOrigin !== undefined && ctx.targetOrigin.length > 0 ? ctx.targetOrigin : null;
  return {
    ...base,
    allowedOrigins: origin === null ? [] : [origin],
    preapprovedWriteTools: origin === null ? [] : [...new Set(ctx.writeToolIds ?? [])],
  };
}

/** Best-effort origin extraction; returns undefined for empty/invalid URLs (works in renderer + node). */
export function originOf(url: string | undefined): string | undefined {
  if (url === undefined || url.trim().length === 0) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Derive a short task name from a prompt (whitespace-collapsed, ≤80 chars) — mirrors conversation titles. */
export function deriveTaskName(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  return compact.length === 0 ? 'Untitled task' : compact.slice(0, 80);
}

/** The first non-manual trigger — the one the manager summarizes as the task's schedule. */
export function primaryScheduleTrigger(triggers: readonly TaskTrigger[]): TaskTrigger | undefined {
  return triggers.find((trigger) => trigger.type !== 'manual');
}

/** The minimal shape a task needs from an agent conversation (avoids depending on @tepegoz/ext-agent). */
export interface ConversationSeed {
  id: string;
  firstPrompt: string;
}

export interface BuildTaskFromConversationInput {
  conversation: ConversationSeed;
  preset: SchedulePreset;
  autonomy: TaskAutonomyPreset;
  /** Instruction the task runs each time; defaults to the conversation's originating prompt. */
  prompt?: string | undefined;
  /** Display name; defaults to a title derived from the originating prompt. */
  name?: string | undefined;
  targetUrl?: string | undefined;
  everyMinutes?: number | undefined;
  selector?: string | undefined;
  changeMode?: TaskPageChangeMode | undefined;
  /** When set, re-converting updates the existing task in place instead of creating a duplicate. */
  existingTaskId?: string | undefined;
}

/**
 * Assemble a {@link TaskSaveInput} from an agent conversation. Always includes a `manual` trigger (so
 * "Run now" works) plus the schedule trigger from the preset. Policy is left unset — the host synthesizes
 * it from `autonomy`.
 */
export function buildTaskSaveInputFromConversation(
  input: BuildTaskFromConversationInput,
): TaskSaveInput {
  const prompt = (input.prompt ?? input.conversation.firstPrompt).trim();
  const name = (input.name ?? deriveTaskName(input.conversation.firstPrompt)).trim();
  const targetUrl = input.targetUrl?.trim();
  const hasUrl = targetUrl !== undefined && targetUrl.length > 0;
  const targetOrigin = hasUrl ? originOf(targetUrl) : undefined;
  const scheduleTrigger = presetToTrigger(input.preset, {
    ...(input.everyMinutes !== undefined ? { everyMinutes: input.everyMinutes } : {}),
    ...(input.preset === 'pageChange' && hasUrl ? { url: targetUrl } : {}),
    ...(input.selector !== undefined ? { selector: input.selector } : {}),
    ...(input.changeMode !== undefined ? { changeMode: input.changeMode } : {}),
  });
  return {
    ...(input.existingTaskId !== undefined ? { id: input.existingTaskId } : {}),
    name,
    prompt,
    triggers: [{ type: 'manual' }, scheduleTrigger],
    autonomy: input.autonomy,
    ...(hasUrl ? { targetUrl } : {}),
    ...(targetOrigin !== undefined ? { targetOrigin } : {}),
    sourceConversationId: input.conversation.id,
  };
}
