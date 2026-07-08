import { AppError, Logger } from '@tepegoz/libs';
import { ModelGateway, type CanonMessage } from '@tepegoz/model-gateway';
import { ToolGateway, type InvokeContext } from '@tepegoz/capability-plane';
import { SECURITY_PREAMBLE, wrapUserRequest } from '@tepegoz/tool-executor';
import { z } from 'zod';
import type { AIProvider, ToolDescriptor, ToolError } from '@tepegoz/shared-types';
import type { StepOutcome, StopReason } from './executor';
import { ReactorMessages } from './messages';
import {
  classifyRuntimeError,
  classifyToolFailure,
  recoveryAdviceFor,
  stopReasonForFailure,
  type AgentFailure,
} from './recovery';

/**
 * L3 reactive executor — the perceive → decide → act loop. Unlike the static {@link Executor} (which
 * runs a plan fixed *before* the page is seen), the reactor asks the model for the NEXT single tool
 * call given the goal + everything observed so far, runs it through the single ToolGateway PEP (Policy
 * Kernel + HITL), feeds the observation back, and repeats — so the agent can target live element
 * `ref`s from `browser_get_elements`, react to what a page actually shows, and recover from a failed
 * step. Same Phase-1a safeguards as the static executor: hard `maxSteps` cap, Loop Detector, abort,
 * and a post-step guard (Human Handoff Controller). The model's output is UNTRUSTED — every decision
 * is JSON-extracted + zod-validated and the chosen tool must be registered before it can run.
 */

/**
 * The actor's progress "brain" (AI-3): a self-assessment carried on every decision. `memory` forces
 * explicit progress counting ("2 of 10 done") — a strong anti-loop / don't-give-up signal. All optional
 * so weak models that omit them still parse (json_object mode only guarantees valid JSON, not shape).
 */
const BRAIN_FIELDS = {
  evaluation_previous_goal: z.string().max(500).optional(),
  memory: z.string().max(1500).optional(),
  next_goal: z.string().max(500).optional(),
};

/** The model's next move: run one tool, or declare the goal met. Validated at the (untrusted) boundary. */
const DecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('act'),
    tool: z.string().min(1).max(100),
    args: z.unknown().default({}),
    rationale: z.string().max(500).default(''),
    ...BRAIN_FIELDS,
  }),
  z.object({ action: z.literal('finish'), summary: z.string().max(1000).default(''), ...BRAIN_FIELDS }),
]);
export type Decision = z.infer<typeof DecisionSchema>;

function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** Unwrap a single-object envelope like {"decision": {…}} / {"response": {…}} when the top level has
 *  no `action` of its own. */
function unwrapEnvelope(obj: Record<string, unknown>): Record<string, unknown> {
  if ('action' in obj) return obj;
  for (const key of ['decision', 'response', 'result', 'output']) {
    const inner = obj[key];
    if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }
  return obj;
}

/** True for a `{domain}_{verb}_{noun}`-shaped tool id (≥3 lowercase segments) — used to tell a real
 *  tool id apart from a discriminator ('act'/'finish') or misplaced junk like a numeric ref. */
function looksLikeToolId(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}$/.test(v);
}

/** The best tool id in the object: a tool-id-shaped `tool`/`action`/`name`, else any string `tool`.
 *  Handles models that put the tool id in `action` (with `tool` holding junk like a ref number). */
function resolveToolId(obj: Record<string, unknown>): string | undefined {
  for (const key of ['tool', 'action', 'name']) {
    const v = obj[key];
    if (looksLikeToolId(v)) return v;
  }
  return typeof obj['tool'] === 'string' ? obj['tool'] : undefined;
}

/** Normalize toward the DecisionSchema discriminator, salvaging the common weak-model shapes. */
function normalizeAction(obj: Record<string, unknown>): Record<string, unknown> {
  const action = obj['action'];
  if (action === 'finish') return obj;
  // Already a clean act.
  if (action === 'act' && typeof obj['tool'] === 'string') return obj;
  // Otherwise salvage: any resolvable tool id ⇒ an act (overriding a bogus `tool`, e.g. a ref number
  // the model put there while placing the real tool id in `action`); else a summary ⇒ finish.
  const toolId = resolveToolId(obj);
  if (toolId !== undefined) return { ...obj, action: 'act', tool: toolId };
  if (typeof obj['summary'] === 'string') return { ...obj, action: 'finish' };
  return obj;
}

/**
 * Weak models still don't constrain SHAPE (json_object mode only guarantees *valid* JSON), so they
 * commonly wrap the decision in an envelope or use near-miss keys. Normalize the well-known variants
 * toward {@link DecisionSchema} — this only nudges an already-intended decision into the canonical
 * shape; zod still rejects anything invalid afterward and the reactor still requires the tool to be
 * registered before it can run, so nothing unsafe slips through.
 */
export function coerceDecisionShape(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  let obj = unwrapEnvelope(raw as Record<string, unknown>);
  // Alias the OpenAI-function-style "arguments" → "args".
  if (!('args' in obj) && 'arguments' in obj) {
    obj = { ...obj, args: obj['arguments'] };
  }
  return normalizeAction(obj);
}

/** Parse the model's raw turn into a validated {@link Decision}. Throws AppError on malformed output. */
export function parseDecision(text: string): Decision {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    Logger.warn(ReactorMessages.InvalidJson, { raw: text.slice(0, 400) });
    throw new AppError(ReactorMessages.InvalidJson, 502);
  }
  const parsed = DecisionSchema.safeParse(coerceDecisionShape(raw));
  if (!parsed.success) {
    Logger.warn(ReactorMessages.MalformedDecision, { raw: text.slice(0, 400), issues: parsed.error.issues });
    throw new AppError(ReactorMessages.MalformedDecision, 502);
  }
  return parsed.data;
}

export interface ReactRequest {
  goal: string;
  /** Approved-plan outline shown to the model as guidance (not a rigid script). */
  outline?: string[];
  /** Steps the user pruned from the plan preview — the agent must NOT do these. */
  avoid?: string[];
  tools: Pick<ToolDescriptor, 'id' | 'description' | 'dangerClass'>[];
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Prior conversation turns (earlier user prompts + the agent's closing summaries) so follow-up
   *  messages have context — injected between the system prompt and the current goal. */
  history?: readonly CanonMessage[];
}

/**
 * Completion-authority hook (AI-3 PR2). When supplied, the ACTOR can no longer end the run by itself:
 * its `finish` becomes a *claim* that the validator (a periodic Planner pass) must confirm. Only a
 * `done: true` verdict terminates — supplying the authoritative `finalAnswer`. This is the loop-level
 * fix for premature give-ups ("I couldn't find the blog" after one page).
 */
export interface CompletionContext {
  goal: string;
  /** The actor's latest progress ledger (`memory` field), carried across steps. */
  memory: string;
  /** The actor's `finish` summary when this check was triggered by a completion CLAIM. */
  claimedSummary?: string;
  /** What prompted the check — an actor claim, or the periodic cadence. */
  trigger: 'claim' | 'periodic';
  /** Compact tail of recent observations, so the validator can judge against real page evidence. */
  recentObservations: readonly string[];
}
export interface CompletionVerdict {
  done: boolean;
  /** The authoritative final answer when `done` — wired to the run summary. */
  finalAnswer?: string;
  /** Why not done (fed back to the actor as guidance to continue). */
  reason?: string;
}

export interface ReactOptions {
  maxSteps?: number;
  loopThreshold?: number;
  /**
   * The completion validator (AI-3). Present ⇒ the actor's `finish` is only a claim; the validator is
   * the sole terminator. Absent ⇒ legacy behaviour (the actor's `finish` ends the run directly).
   */
  validateCompletion?: (ctx: CompletionContext) => Promise<CompletionVerdict>;
  /** Cadence for the periodic validator pass (in actions taken). Default 3. */
  planningInterval?: number;
  /** Rejected completion CLAIMS tolerated before conceding to the actor (fail-closed). Default 3. */
  maxCompletionRejects?: number;
  /** Per-call Policy Kernel context (targetUrl for the sensitive-site lockout, taintedArgs). */
  ctxFor?: (tool: string, args: unknown) => InvokeContext;
  signal?: { readonly aborted: boolean };
  /** Fired when the model chooses to act, before the tool runs (Agent Console). */
  onDecision?: (tool: string, rationale: string) => void;
  /** Fired after each tool call resolves (drives taint recording + console step events). */
  onOutcome?: (outcome: StepOutcome) => void;
  /** Post-step guard (Human Handoff Controller): return a StopReason to halt (e.g. CAPTCHA/2FA). */
  guard?: (outcome: StepOutcome) => StopReason | null;
  /** Bounded self-repair attempts for malformed model decisions. */
  maxDecisionRepairs?: number;
  /** Bounded recovery attempts per failure kind+tool before fail-closed. */
  maxRecoveryAttempts?: number;
}

export interface ReactResult {
  outcomes: StepOutcome[];
  stoppedReason: StopReason;
  failure?: AgentFailure | undefined;
  /** The model's closing summary when it finished on its own. */
  summary?: string;
}

/** Longest single observation fed back to the model (truncate untrusted page dumps; compaction → 1b). */
const MAX_OBSERVATION_CHARS = 6000;
/** Observations longer than this are treated as page-state blobs subject to transient collapse (AI-3). */
const STATE_COLLAPSE_THRESHOLD = 800;
/** Replaces a superseded page-state observation so only the LATEST one stays live (bounds context). */
const COLLAPSED_STATE_PLACEHOLDER =
  'Observation: [an earlier page snapshot was omitted here to save context — re-read ' +
  'browser_get_elements / browser_get_page if you need that page state again].';

function isToolError(v: unknown): v is ToolError {
  return typeof v === 'object' && v !== null && (v as { isError?: unknown }).isError === true;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** The observation text fed back to the model after a tool call — a read tool's already-wrapped
 *  `content` when present, else a compact JSON of the result; truncated to keep the prompt bounded. */
function observationOf(outcome: StepOutcome): string {
  if (!outcome.ok) {
    const err = outcome.error;
    return `Tool "${outcome.tool}" failed: ${err?.code ?? 'ERROR'} — ${err?.message ?? 'unknown error'}`;
  }
  const result = outcome.result;
  const text =
    result !== null && typeof result === 'object' && typeof (result as { content?: unknown }).content === 'string'
      ? (result as { content: string }).content
      : stableStringify(result);
  return text.length > MAX_OBSERVATION_CHARS ? `${text.slice(0, MAX_OBSERVATION_CHARS)}\n…[truncated]` : text;
}

function observationWithRecovery(outcome: StepOutcome, failure: AgentFailure): string {
  const advice = recoveryAdviceFor(failure);
  const next = advice.nextTool === undefined ? '' : ` Suggested next tool: ${advice.nextTool}.`;
  return `${observationOf(outcome)}\nRecovery: ${advice.instruction}${next}`;
}

/** Coreference guidance — emitted only when there ARE earlier turns, so a follow-up like "research this"
 *  resolves its pronoun to the real subject instead of being taken literally. */
const COREFERENCE_INSTRUCTION =
  '\nThe messages before the goal are earlier turns of the SAME conversation. Resolve any pronoun or ' +
  'deictic in the goal (English: this/that/it/them; Turkish: bunu/şunu/onu/o/bunları) to the concrete ' +
  'subject from those earlier turns BEFORE choosing a tool, and never use a bare pronoun as a search ' +
  'query or fill text.';

/** Browsing strategy — reuse the current tab by default; a new tab is the exception, not the habit. */
const BROWSING_STRATEGY =
  '\nPrefer to stay in the CURRENT tab: navigate it with browser_update_location. Open a new tab with ' +
  'tab_create_item ONLY when the current page must stay open or you need a side-by-side comparison — ' +
  'and when you do, pass a short groupName naming the task so the new tab is grouped. New tabs open ' +
  'in the background by default; pass the returned id as `tabId` to browser_* tools when working on ' +
  'that tab. Use tab_update_item only when the tab must become visible/focused. Close tabs you opened ' +
  'with tab_delete_item when they are no longer needed. After browser_update_page or navigation, verify ' +
  'the result with browser_validate_page, browser_get_page, or browser_get_elements before continuing. ' +
  'If browser_get_page/browser_get_elements do not expose enough information, use browser_get_screenshot ' +
  'as a visual fallback. If browser_update_page returns changed=false, do not repeat the same ref blindly; ' +
  're-read browser_get_elements and try a different actionable ref or finish with a clear limitation.' +
  '\nWhen you cannot find a target section or link on the page, do NOT give up after reading only the ' +
  'landing page. First REVEAL hidden navigation: a site\'s links are often behind a menu / hamburger / ' +
  'drawer or an overflow ("☰", "Menu", "More") toggle, or below the fold — click that toggle with ' +
  'browser_update_page (or scroll), then re-read browser_get_elements, because a collapsed menu\'s links ' +
  'are NOT listed until it is opened. If the target is still not found, navigate directly to a ' +
  'conventional path on the SAME site with browser_update_location by appending a likely path to the ' +
  'origin (e.g. /blog, /posts, /articles, /about) and verify with browser_get_page or ' +
  'browser_validate_page; if a path 404s or is empty, try another common candidate (a few at most), then ' +
  'finish with a clear limitation.';

function systemPrompt(req: ReactRequest): string {
  const toolList = req.tools.map((t) => `- ${t.id} (${t.dangerClass}): ${t.description}`).join('\n');
  const outline = req.outline && req.outline.length > 0 ? `\nSuggested approach:\n${req.outline.join('\n')}` : '';
  const avoid = req.avoid && req.avoid.length > 0 ? `\nDo NOT do (the user removed these): ${req.avoid.join('; ')}` : '';
  const coref = req.history && req.history.length > 0 ? COREFERENCE_INSTRUCTION : '';
  return (
    `${SECURITY_PREAMBLE}\n\n` +
    'You are an agent driving a web browser one action at a time. Given the goal and everything ' +
    'observed so far, decide the SINGLE next step. To interact with a page, first call ' +
    'browser_get_elements to see the actionable elements and their refs, then use browser_update_page ' +
    'with a ref. Output ONLY JSON, no prose or markdown fences, of exactly one of:\n' +
    '{"action":"act","tool":"<id>","args":{…},"rationale":"<why>","evaluation_previous_goal":"<did the last action achieve its goal? success/failure and why>","memory":"<concrete progress so far, counting explicitly e.g. \'opened 2 of 5 products\'>","next_goal":"<the immediate objective of THIS step>"}\n' +
    '{"action":"finish","summary":"<what you accomplished>","memory":"<final progress>"}\n' +
    'Always fill evaluation_previous_goal / memory / next_goal — memory is your running progress ledger: ' +
    'carry forward what you have already done and what remains (with counts) so you never repeat a step or ' +
    'give up while items remain. Finish as soon as the goal is met or is genuinely impossible. ' +
    'Use ONLY these tools (by exact id):\n' +
    toolList +
    BROWSING_STRATEGY +
    coref +
    outline +
    avoid
  );
}

export default class Reactor {
  static async run(req: ReactRequest, options: ReactOptions = {}): Promise<ReactResult> {
    const maxSteps = options.maxSteps ?? 25;
    const loopThreshold = options.loopThreshold ?? 3;
    const known = new Set(req.tools.map((t) => t.id));
    // Idempotent read-only tools (perception/verification, dangerClass 'read') are EXEMPT from the loop
    // detector below: re-reading the page after each action is the encouraged state-every-step pattern, and
    // because `signatureCounts` is run-global (non-consecutive) counting them would trip a healthy
    // multi-step task on its 3rd identical re-read. A read-only spin is still bounded by `maxSteps`.
    const readOnlyTools = new Set(req.tools.filter((t) => t.dangerClass === 'read').map((t) => t.id));
    const outcomes: StepOutcome[] = [];
    const signatureCounts = new Map<string, number>();
    const loopNudged = new Set<string>();
    const recoveryCounts = new Map<string, number>();
    const maxDecisionRepairs = options.maxDecisionRepairs ?? 2;
    const maxRecoveryAttempts = options.maxRecoveryAttempts ?? 2;
    const planningInterval = Math.max(1, options.planningInterval ?? 3);
    const maxCompletionRejects = options.maxCompletionRejects ?? 3;
    let decisionRepairs = 0;
    // Completion-authority state (AI-3 PR2): the actor's latest progress ledger, how many finish
    // CLAIMS the validator has rejected (fail-closed guard), and the action count last validated
    // (so a periodic check fires once per cadence tick, not on every no-op turn).
    let latestMemory = '';
    let completionRejects = 0;
    let lastValidatedCount = -1;

    /** The compact tail of recent observations handed to the completion validator as page evidence. */
    const recentObservations = (): string[] =>
      outcomes.slice(-3).map((o) => {
        const text = observationOf(o);
        return text.length > 500 ? `${text.slice(0, 500)}…` : text;
      });

    const validator = options.validateCompletion;
    /** Run the validator, fail-open to "not done" on error so a validator hiccup never kills the run. */
    const validate = async (ctx: CompletionContext): Promise<CompletionVerdict> => {
      if (validator === undefined) return { done: false };
      try {
        return await validator(ctx);
      } catch (err) {
        Logger.warn('completion validator failed; treating as not-done', { err: String(err) });
        return { done: false };
      }
    };

    /** Periodic validator pass: end the run iff the Planner judges the goal already met. Else null. */
    const periodicCheck = async (): Promise<ReactResult | null> => {
      if (
        validator === undefined ||
        outcomes.length === 0 ||
        outcomes.length % planningInterval !== 0 ||
        outcomes.length === lastValidatedCount
      ) {
        return null;
      }
      lastValidatedCount = outcomes.length;
      const verdict = await validate({
        goal: req.goal,
        memory: latestMemory,
        trigger: 'periodic',
        recentObservations: recentObservations(),
      });
      return verdict.done ? { outcomes, stoppedReason: 'completed', summary: verdict.finalAnswer ?? latestMemory } : null;
    };

    /**
     * Resolve the actor's `finish` CLAIM. Without a validator the claim ends the run (legacy). With one,
     * only a `done` verdict ends it (with the authoritative answer); a rejection pushes continue-guidance
     * and returns null so the loop goes on — until `maxCompletionRejects`, after which we concede to the
     * actor rather than burn the whole step budget.
     */
    const settleClaim = async (summary: string): Promise<ReactResult | null> => {
      if (validator === undefined) return { outcomes, stoppedReason: 'completed', summary };
      const verdict = await validate({
        goal: req.goal,
        memory: latestMemory,
        claimedSummary: summary,
        trigger: 'claim',
        recentObservations: recentObservations(),
      });
      if (verdict.done) return { outcomes, stoppedReason: 'completed', summary: verdict.finalAnswer ?? summary };
      completionRejects += 1;
      if (completionRejects > maxCompletionRejects) return { outcomes, stoppedReason: 'completed', summary };
      const reason = verdict.reason !== undefined && verdict.reason.length > 0 ? ` — ${verdict.reason}` : '';
      messages.push({
        role: 'user',
        content:
          `Completion check: NOT done yet${reason}. Do NOT finish. Continue toward the goal (open menus, ` +
          'try other links or conventional paths, or read more of the page) and only finish once every ' +
          'part of the goal is actually satisfied.',
      });
      return null;
    };

    const messages: CanonMessage[] = [
      { role: 'system', content: systemPrompt(req) },
      ...(req.history ?? []),
      { role: 'user', content: `Goal:\n${wrapUserRequest(req.goal)}` },
    ];

    // Transient page-state (AI-3): keep only the LATEST large observation live. When a new page-state
    // blob is fed back, the previous one is collapsed to a placeholder so DOM dumps never accumulate
    // across a long run — the compact decisions (with their `memory`) remain the persistent history.
    let lastStateIndex: number | null = null;
    const pushObservation = (content: string): void => {
      const isState = content.length > STATE_COLLAPSE_THRESHOLD;
      if (isState && lastStateIndex !== null) {
        const prev = messages[lastStateIndex];
        if (prev !== undefined) messages[lastStateIndex] = { ...prev, content: COLLAPSED_STATE_PLACEHOLDER };
      }
      messages.push({ role: 'user', content });
      if (isState) lastStateIndex = messages.length - 1;
    };

    for (let step = 0; ; step++) {
      if (options.signal?.aborted === true) return { outcomes, stoppedReason: 'aborted' };
      if (outcomes.length >= maxSteps) return { outcomes, stoppedReason: 'max_steps' };

      // Periodic validator pass (AI-3): every `planningInterval` actions the Planner checks whether the
      // goal is already met — catching an actor stuck acting past completion.
      const periodicDone = await periodicCheck();
      if (periodicDone !== null) return periodicDone;

      let responseText: string;
      let decision: Decision;
      try {
        const response = await ModelGateway.complete({
          provider: req.provider,
          model: req.model,
          capability: 'exec',
          messages,
          maxTokens: req.maxTokens ?? 1500,
          timeoutMs: req.timeoutMs ?? 60_000,
          responseFormat: 'json',
        });
        responseText = response.text;
        decision = parseDecision(responseText);
      } catch (err) {
        const failure = classifyRuntimeError(err);
        if (failure.kind === 'model_malformed' && decisionRepairs < maxDecisionRepairs) {
          decisionRepairs += 1;
          const advice = recoveryAdviceFor(failure);
          messages.push({
            role: 'user',
            content:
              `Recovery: ${advice.instruction} Output ONLY one valid JSON object: ` +
              '{"action":"act","tool":"<id>","args":{},"rationale":"<why>"} or ' +
              '{"action":"finish","summary":"<summary>"}.',
          });
          continue;
        }
        return { outcomes, stoppedReason: stopReasonForFailure(failure), failure };
      }
      decisionRepairs = 0;
      messages.push({ role: 'assistant', content: responseText });
      if (decision.memory !== undefined && decision.memory.length > 0) latestMemory = decision.memory;

      if (decision.action === 'finish') {
        const settled = await settleClaim(decision.summary);
        if (settled !== null) return settled;
        continue;
      }

      // The model's tool choice is untrusted — an unregistered id is fed back as an error, never run.
      if (!known.has(decision.tool)) {
        messages.push({ role: 'user', content: `Observation: unknown tool "${decision.tool}". Choose a listed tool.` });
        continue;
      }

      // Loop detection counts only STATE-CHANGING actions (reads are exempt — see `readOnlyTools`).
      if (!readOnlyTools.has(decision.tool)) {
        const signature = `${decision.tool}:${stableStringify(decision.args)}`;
        const count = (signatureCounts.get(signature) ?? 0) + 1;
        signatureCounts.set(signature, count);
        if (count >= loopThreshold) {
          // Don't concede on the first repeat: a stuck agent is usually repeating an action that ALREADY
          // succeeded (a menu it opened is open; its click landed) or targeting a stale ref — the model just
          // failed to perceive it. Give ONE structured recovery turn (verify, then act differently) before
          // the hard stop. Only a further identical repeat after the nudge is a real loop.
          if (!loopNudged.has(signature)) {
            loopNudged.add(signature);
            pushObservation(
              `Observation: You have chosen ${decision.tool} with identical arguments ${String(count)} ` +
                'times without moving toward the goal. It may ALREADY have taken effect (e.g. the menu / ' +
                'panel you are toggling is already open) or the ref may be stale — verify by re-reading ' +
                'browser_get_elements (or browser_get_screenshot) rather than assuming. Then act on a ' +
                'DIFFERENT element to advance the goal; do NOT repeat this exact call.',
            );
            continue;
          }
          return { outcomes, stoppedReason: 'loop_detected' };
        }
      }

      options.onDecision?.(decision.tool, decision.rationale);
      const ctx = options.ctxFor ? options.ctxFor(decision.tool, decision.args) : {};
      const result = await ToolGateway.invoke(decision.tool, decision.args, ctx);
      const outcome: StepOutcome = isToolError(result)
        ? { stepId: `r${String(step)}`, tool: decision.tool, args: decision.args, ok: false, error: result }
        : { stepId: `r${String(step)}`, tool: decision.tool, args: decision.args, ok: true, result };
      outcomes.push(outcome);
      options.onOutcome?.(outcome);

      // A policy/HITL denial is the user's hard "no" → stop. Recoverable failures are fed back with
      // a concrete recovery hint, but repeated same-kind failures fail closed instead of looping.
      if (!outcome.ok) {
        const failure = classifyToolFailure(outcome);
        if (!failure.retryable) {
          return { outcomes, stoppedReason: stopReasonForFailure(failure), failure };
        }
        const key = `${failure.kind}:${outcome.tool}`;
        const recoveryCount = (recoveryCounts.get(key) ?? 0) + 1;
        recoveryCounts.set(key, recoveryCount);
        if (recoveryCount > maxRecoveryAttempts) {
          return { outcomes, stoppedReason: stopReasonForFailure(failure), failure };
        }
        pushObservation(`Observation:\n${observationWithRecovery(outcome, failure)}`);
        continue;
      }

      const halt = outcome.ok ? options.guard?.(outcome) : null;
      if (halt != null) return { outcomes, stoppedReason: halt };

      pushObservation(`Observation:\n${observationOf(outcome)}`);
    }
  }
}
