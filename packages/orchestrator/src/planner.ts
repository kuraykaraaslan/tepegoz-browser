import { z } from 'zod';
import { AppError, Logger } from '@tepegoz/libs';
import { ModelGateway, type CanonMessage, type CanonRequest } from '@tepegoz/model-gateway';
import type { CompletionEvidence, CompletionOutcome } from '@tepegoz/shared-types';
import { classifyClaim, describeEvidence } from './completion-evidence';
import { SECURITY_PREAMBLE, wrapUserRequest } from '@tepegoz/tool-executor';
import {
  PlanSchema,
  type AgentWorkingState,
  type AIProvider,
  type Plan,
  type ToolDescriptor,
} from '@tepegoz/shared-types';
import { PlannerMessages } from './messages';
import { renderWorkingState } from './reactor-working-state';

/**
 * The completion-validation request: goal + the actor's progress evidence. `Planner.validateCompletion`
 * is the sole completion AUTHORITY for the reactive loop (AI-3) — the actor's `finish` is only a claim.
 */
export interface CompletionValidationRequest {
  goal: string;
  /** The actor's running progress ledger (`memory`). */
  memory: string;
  /** The actor's `finish` summary, when validating a completion CLAIM. */
  claimedSummary?: string | undefined;
  /** Compact tail of recent page observations — the ground-truth evidence to judge against. */
  recentObservations: readonly string[];
  /**
   * Typed evidence for the claim (S4). Present ⇒ the verdict's *authority* is deterministic: a claim
   * whose evidence contradicts it, or a state-changing claim with nothing supporting it, is downgraded
   * in CODE. The model is still asked, but only for the wording.
   *
   * Absent ⇒ legacy behaviour (the model decides alone), so callers with no evidence to give are
   * unaffected.
   */
  evidence?: CompletionEvidence | undefined;
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/** The validator's verdict: is the goal actually, fully done — and if so, the authoritative answer. */
export interface CompletionValidation {
  done: boolean;
  finalAnswer?: string;
  reason?: string;
  /**
   * What the evidence supported, when evidence was supplied (S4). `attempted_unverified` and
   * `contradicted` both mean `done: false`, but they are different facts and the harness counts them
   * differently: one is "I could not confirm it", the other is "the server said no".
   */
  outcome?: CompletionOutcome;
}

/** Untrusted-model boundary: the verdict shape the validator must return. */
const CompletionSchema = z.object({
  done: z.boolean(),
  final_answer: z.string().max(2000).optional(),
  reason: z.string().max(1000).optional(),
});

/**
 * The replan request (C1 PR2): fired when the reactor detects no observable progress across N acting steps.
 * The Planner proposes a genuinely DIFFERENT approach from the goal + the actor's typed/free-text ledger +
 * recent page evidence. Advisory (a steer, not an authority), so a malformed reply yields `null`.
 */
export interface ReplanRequest {
  goal: string;
  /** The actor's typed working ledger (C1 PR1). */
  workingState: AgentWorkingState;
  /** The actor's free-text progress ledger (`memory`). */
  memory: string;
  /** Compact tail of recent page observations — ground truth to replan against. */
  recentObservations: readonly string[];
  /** Why the replan fired (surfaced to the model so it understands it is stuck). */
  reason: string;
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Untrusted-model boundary: the replan shape. `approach` is the new plan, in prose the actor can follow. */
const ReplanSchema = z.object({ approach: z.string().max(2000) });

/**
 * L3 Planner: natural-language intent → a validated {@link Plan} (DAG of tool-call steps). The LLM's
 * output is UNTRUSTED — it is JSON-extracted, zod-validated against PlanSchema, and every referenced
 * tool is checked against the registered tool set before the plan is allowed to run. Phase 1a plans
 * execute sequentially (see Executor); the editable plan-preview/HITL gate lives in the UI layer.
 */
export interface PlanRequest {
  intent: string;
  tools: Pick<ToolDescriptor, 'id' | 'description' | 'dangerClass'>[];
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Prior conversation turns so the plan for a follow-up message accounts for earlier context. */
  history?: readonly CanonMessage[];
}

function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export default class Planner {
  static async plan(req: PlanRequest): Promise<Plan> {
    const toolList = req.tools
      .map((t) => `- ${t.id} (${t.dangerClass}): ${t.description}`)
      .join('\n');
    // Coreference guidance — only when there ARE earlier turns, so a follow-up ("research this") plans
    // for the real subject rather than the literal pronoun.
    const coref =
      req.history && req.history.length > 0
        ? 'The messages before the goal are earlier turns of the SAME conversation. Resolve any pronoun ' +
          'or deictic in the goal (English: this/that/it/them; Turkish: bunu/şunu/onu/o/bunları) to the ' +
          'concrete subject from those earlier turns BEFORE planning. '
        : '';
    const system =
      `${SECURITY_PREAMBLE}\n\n` +
      'You are the planner for an agentic browser. Produce a plan of tool-call steps that ' +
      "accomplishes the user's goal. " +
      coref +
      'Prefer navigating the current tab with browser_update_location; only plan a tab_create_item when ' +
      'a new tab is genuinely needed (the current page must stay open or a side-by-side comparison). ' +
      'New tabs open in the background by default, so pass the returned id as `tabId` to browser_* tools ' +
      'when working on that tab; use tab_update_item only when the tab must become visible/focused. ' +
      'After browser_update_page or navigation, verify the result with browser_validate_page, ' +
      'browser_get_page, or browser_get_elements before continuing. Clean up agent-opened tabs with ' +
      'tab_delete_item when done. If text/a11y reads are insufficient, the target is usually not in view ' +
      'yet — plan a scroll (or browser_update_page scroll_to_text) and a re-read rather than a screenshot ' +
      '(the screenshot image is not sent to the model, so it reveals nothing). ' +
      'If an interaction reports changed=false, re-read browser_get_elements and try a ' +
      'different ref instead of repeating the same action. ' +
      'If a target section/link may be behind a menu/drawer, plan to open it (click the menu/hamburger ' +
      'toggle) then re-read browser_get_elements. Prefer a route you can SEE or VERIFY: navigate to a link ' +
      "the page (or the site's sitemap) actually shows — do NOT plan to guess a conventional path by " +
      'appending it to the origin. When the destination is genuinely off this site or its URL is unknown, ' +
      'plan a web_search_items instead of fabricating a URL. ' +
      'Output ONLY JSON of the form ' +
      '{"goal": string, "steps": [{"id": string, "tool": string, "args": object, "rationale": string, "dependsOn": string[]}]}. ' +
      `Use ONLY these tools (by exact id):\n${toolList}\n` +
      'No prose and no markdown fences.';

    const canon: CanonRequest = {
      provider: req.provider,
      model: req.model,
      capability: 'plan',
      messages: [
        { role: 'system', content: system },
        ...(req.history ?? []),
        { role: 'user', content: wrapUserRequest(req.intent) },
      ],
      maxTokens: req.maxTokens ?? 2000,
      timeoutMs: req.timeoutMs ?? 60_000,
      responseFormat: 'json',
    };

    const response = await ModelGateway.complete(canon);

    let raw: unknown;
    try {
      raw = JSON.parse(extractJson(response.text));
    } catch {
      Logger.warn(PlannerMessages.InvalidJson, { raw: response.text.slice(0, 400) });
      throw new AppError(PlannerMessages.InvalidJson, 502);
    }

    const parsed = PlanSchema.safeParse(raw);
    if (!parsed.success) {
      Logger.warn(PlannerMessages.MalformedPlan, {
        raw: response.text.slice(0, 400),
        issues: parsed.error.issues,
      });
      throw new AppError(PlannerMessages.MalformedPlan, 502);
    }

    const known = new Set(req.tools.map((t) => t.id));
    for (const step of parsed.data.steps) {
      if (!known.has(step.tool)) {
        throw new AppError(PlannerMessages.unknownTool(step.tool), 502);
      }
    }
    return parsed.data;
  }

  /**
   * Completion authority for the reactive loop (AI-3): judge whether the GOAL is ACTUALLY and FULLY
   * accomplished from the actor's progress + recent page evidence. Deliberately strict — a give-up, a
   * partial result, or a not-yet-produced answer is NOT done. When done, supplies the `final_answer`.
   * The model output is UNTRUSTED → JSON-extracted + zod-validated.
   */
  static async validateCompletion(req: CompletionValidationRequest): Promise<CompletionValidation> {
    const system =
      `${SECURITY_PREAMBLE}\n\n` +
      'You are the STRICT completion validator for an agentic browser run. Given the user GOAL, the ' +
      "actor's progress ledger, and recent page observations, decide whether the goal is ACTUALLY and " +
      'FULLY accomplished. Be strict: if the actor gave up, completed only part of the goal, or has not ' +
      'yet produced the information the user asked for, it is NOT done. Prefer done=false when unsure — ' +
      'a premature "done" is worse than one more step. When done, put the exact answer the user wanted in ' +
      'final_answer; when not done, put what still remains in reason. ' +
      'Output ONLY JSON: {"done": boolean, "final_answer": string, "reason": string}. No prose, no fences.';
    // S4: classify FIRST, deterministically. The model never gets to overturn the evidence — asking it to
    // judge success from a page that may be lying is the exact failure this phase exists to remove.
    const outcome = req.evidence === undefined ? undefined : classifyClaim(req.evidence);
    const user =
      `GOAL: ${req.goal}\n\n` +
      `Actor progress ledger: ${req.memory.length > 0 ? req.memory : '(none recorded)'}\n` +
      (req.claimedSummary !== undefined && req.claimedSummary.length > 0
        ? `\nThe actor CLAIMS it is done. Its summary: ${req.claimedSummary}\n`
        : '') +
      `\nRecent page observations:\n${req.recentObservations.length > 0 ? req.recentObservations.join('\n---\n') : '(none)'}` +
      (req.evidence === undefined ? '' : `\n\n${describeEvidence(req.evidence)}`) +
      (outcome === 'contradicted'
        ? '\n\nA record CONTRADICTS this claim. The action did not take effect. Say so plainly, and name what failed.'
        : outcome === 'attempted_unverified'
          ? '\n\nNothing confirms the state-changing action in this run. Do NOT claim it succeeded; say it was attempted and could not be confirmed.'
          : '');

    const canon: CanonRequest = {
      provider: req.provider,
      model: req.model,
      capability: 'plan',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: req.maxTokens ?? 800,
      timeoutMs: req.timeoutMs ?? 60_000,
      responseFormat: 'json',
    };

    const response = await ModelGateway.complete(canon);
    let raw: unknown;
    try {
      raw = JSON.parse(extractJson(response.text));
    } catch {
      Logger.warn(PlannerMessages.InvalidJson, { raw: response.text.slice(0, 400) });
      throw new AppError(PlannerMessages.InvalidJson, 502);
    }
    const parsed = CompletionSchema.safeParse(raw);
    if (!parsed.success) {
      Logger.warn(PlannerMessages.MalformedValidation, {
        raw: response.text.slice(0, 400),
        issues: parsed.error.issues,
      });
      throw new AppError(PlannerMessages.MalformedValidation, 502);
    }
    // The model supplied wording; the verdict's authority is the evidence. A claim the evidence does
    // not support cannot be talked into `done`.
    const verdict: CompletionValidation = {
      done: outcome === undefined ? parsed.data.done : outcome === 'verified' && parsed.data.done,
    };
    if (outcome !== undefined) verdict.outcome = outcome;
    if (parsed.data.final_answer !== undefined && parsed.data.final_answer.length > 0) {
      verdict.finalAnswer = parsed.data.final_answer;
    }
    if (parsed.data.reason !== undefined && parsed.data.reason.length > 0)
      verdict.reason = parsed.data.reason;
    return verdict;
  }

  /**
   * No-progress replanner (C1 PR2): the run is stuck (no observable page change across N acting steps).
   * Propose a genuinely DIFFERENT approach — not "keep going". ADVISORY: the model output is untrusted and
   * this is only a steer, so any parse/shape failure returns `null` (the run continues) rather than throwing.
   * Goes through ModelGateway like {@link validateCompletion}, so the Egress Firewall + TokenLedger apply.
   */
  static async replan(req: ReplanRequest): Promise<{ guidance: string } | null> {
    const system =
      `${SECURITY_PREAMBLE}\n\n` +
      'You are the REPLANNER for an agentic browser run that is STUCK: recent actions have not moved the ' +
      "page toward the goal. Given the goal, the actor's working state, and recent page observations, " +
      'propose a genuinely DIFFERENT approach — do NOT restate what has already failed and do NOT say ' +
      '"keep trying". Be concrete and imperative: 2–4 short steps that reference real capabilities (reveal ' +
      'a hidden menu/drawer and re-read; scroll a target into view; open a different link; operate the form ' +
      'directly). Prefer a route the agent can SEE or VERIFY on the page over guessing a URL or leaving the ' +
      'site. Output ONLY JSON: {"approach": string}. No prose, no fences.';
    const stateSummary = renderWorkingState(req.workingState);
    const user =
      `GOAL: ${req.goal}\n\n` +
      `Why you are replanning: ${req.reason}\n\n` +
      `Working state:\n${stateSummary.length > 0 ? stateSummary : '(empty)'}\n\n` +
      `Actor progress ledger: ${req.memory.length > 0 ? req.memory : '(none recorded)'}\n\n` +
      `Recent page observations:\n${req.recentObservations.length > 0 ? req.recentObservations.join('\n---\n') : '(none)'}`;

    const canon: CanonRequest = {
      provider: req.provider,
      model: req.model,
      capability: 'plan',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: req.maxTokens ?? 800,
      timeoutMs: req.timeoutMs ?? 60_000,
      responseFormat: 'json',
    };

    let response;
    try {
      response = await ModelGateway.complete(canon);
    } catch (err) {
      Logger.warn(PlannerMessages.ReplanUnusable, { err: String(err) });
      return null;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(extractJson(response.text));
    } catch {
      Logger.warn(PlannerMessages.ReplanUnusable, { raw: response.text.slice(0, 400) });
      return null;
    }
    const parsed = ReplanSchema.safeParse(raw);
    if (!parsed.success || parsed.data.approach.trim().length === 0) {
      Logger.warn(PlannerMessages.ReplanUnusable, { raw: response.text.slice(0, 400) });
      return null;
    }
    return { guidance: parsed.data.approach.trim() };
  }
}
