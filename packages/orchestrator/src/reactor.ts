import { Logger } from '@tepegoz/libs';
import { ModelGateway, type CanonMessage } from '@tepegoz/model-gateway';
import { ToolGateway } from '@tepegoz/capability-plane';
import { wrapUserRequest } from '@tepegoz/tool-executor';
import type { StepOutcome } from './executor';
import {
  classifyRuntimeError,
  classifyToolFailure,
  recoveryAdviceFor,
  stopReasonForFailure,
} from './recovery';
import { parseDecision, type Decision } from './reactor-decision';
import { isToolError, observationOf, observationWithRecovery, stableStringify } from './reactor-observation';
import { COLLAPSED_STATE_PLACEHOLDER, STATE_COLLAPSE_THRESHOLD } from './reactor-page-state';
import { systemPrompt } from './reactor-prompt';
import type {
  CompletionContext,
  CompletionVerdict,
  ReactOptions,
  ReactRequest,
  ReactResult,
} from './reactor-types';

/**
 * L3 reactive executor — the perceive → decide → act loop. Unlike the static {@link Executor} (which
 * runs a plan fixed *before* the page is seen), the reactor asks the model for the NEXT single tool call
 * given the goal + everything observed so far, runs it through the single ToolGateway PEP (Policy Kernel
 * + HITL), feeds the observation back, and repeats. Same Phase-1a safeguards: hard `maxSteps` cap, Loop
 * Detector, abort, and a post-step guard (Human Handoff Controller). The model's output is UNTRUSTED —
 * every decision is JSON-extracted + zod-validated and the chosen tool must be registered before it runs.
 * The decision boundary, observation/transient-page-state helpers, prompt, and public types live in the
 * sibling `reactor-*` modules; this file is the loop plus the re-exports that keep the surface unchanged.
 */

// Re-export the full public surface so existing importers of './reactor' are unaffected.
export { coerceDecisionShape, parseDecision, type Decision } from './reactor-decision';
export type { CompletionContext, CompletionVerdict, ReactOptions, ReactRequest, ReactResult } from './reactor-types';

/** Wall-clock budget for the AI-7 navigation-grounding hook per step. Bounds the hot loop against a slow
 *  or hostile same-origin sitemap fetch (the in-flight fetch keeps running + is cached; the loop just does
 *  not wait past this) so a user cancel never blocks on discovery. */
const NAV_GROUNDING_BUDGET_MS = 8000;

/** Read a live abort signal without control-flow narrowing (the signal mutates between reads, so an earlier
 *  `=== true` guard must not narrow a later check to `false`). */
function signalAborted(signal: { readonly aborted: boolean } | undefined): boolean {
  return signal?.aborted === true;
}

/** Run the grounding hook with a wall-clock budget; resolves null on timeout or any hook error, so a steer
 *  is strictly best-effort and can never stall or crash the loop. */
async function boundedGrounding(
  hook: (outcome: StepOutcome, goal: string) => Promise<string | null>,
  outcome: StepOutcome,
  goal: string,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), NAV_GROUNDING_BUDGET_MS);
  });
  try {
    return await Promise.race([hook(outcome, goal).catch(() => null), budget]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * M1: identical-CONSECUTIVE-read streak guard — the read exemption's honest counterweight (a live
 * trial burned 22 identical `browser_get_elements` calls unpunished). Re-reading after each ACTION is
 * the encouraged pattern and never trips this; only the same read repeated back-to-back does. At the
 * threshold: one 'nudge'; a further identical consecutive read: 'stop'. Any different call resets.
 */
export function createReadStreakGuard(
  threshold: number,
): (isRead: boolean, signature: string) => 'ok' | 'nudge' | 'stop' {
  const cap = Math.max(2, threshold);
  let streakSignature = '';
  let count = 0;
  let nudged = false;
  return (isRead, signature) => {
    if (!isRead) {
      streakSignature = '';
      count = 0;
      nudged = false;
      return 'ok';
    }
    if (signature === streakSignature) {
      count += 1;
    } else {
      streakSignature = signature;
      count = 1;
      nudged = false;
    }
    if (count < cap) return 'ok';
    if (!nudged) {
      nudged = true;
      return 'nudge';
    }
    return 'stop';
  };
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
    // M1: identical-consecutive-read guard (see `createReadStreakGuard`).
    const readStreak = createReadStreakGuard(options.readLoopThreshold ?? 5);
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
    // AI-7: the last navigation-grounding hint injected, so an identical steer is not re-pushed every read.
    let lastNavHint = '';

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
      // Run-control gate (additive; skipped entirely when `control` is absent — byte-identical legacy
      // path): hold the loop while paused-by-user or offline, then fold any mid-run steering messages the
      // user injected into the conversation before the next decision. Abort always wins over a hold.
      if (options.control !== undefined) {
        await options.control.waitWhileHeld();
        if (options.control.aborted) return { outcomes, stoppedReason: 'aborted' };
        for (const steer of options.control.drainSteer()) {
          messages.push({
            role: 'user',
            content: `New instruction from the user (mid-run): ${wrapUserRequest(steer)}\nFold this into your current work; do NOT restart from scratch.`,
          });
        }
      }
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
      // The exemption's counterweight: an IDENTICAL read repeated back-to-back is not the encouraged
      // read-after-act pattern, it is spinning — nothing changed since the same call one step ago.
      // One structured nudge at the cap, then a hard `loop_detected` on a further identical repeat.
      const streakVerdict = readStreak(
        readOnlyTools.has(decision.tool),
        `${decision.tool}:${stableStringify(decision.args)}`,
      );
      if (streakVerdict === 'nudge') {
        pushObservation(
          `Observation: You have made the exact same ${decision.tool} read several times in a row. ` +
            'Re-reading an unchanged page again will not produce new information. ACT instead: ' +
            'click/fill/scroll toward the goal, or finish with what you know. If you are waiting for ' +
            'content to load, use browser_validate_page (it waits) instead of re-reading. Do NOT ' +
            'repeat this exact read.',
        );
        continue;
      }
      if (streakVerdict === 'stop') {
        return { outcomes, stoppedReason: 'loop_detected' };
      }
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
                'browser_get_elements (scroll first if the target may be off-screen) rather than assuming. Then act on a ' +
                'DIFFERENT element to advance the goal; do NOT repeat this exact call.',
            );
            continue;
          }
          return { outcomes, stoppedReason: 'loop_detected' };
        }
      }

      options.onDecision?.(decision.tool, decision.rationale);
      const ctx = options.ctxFor ? options.ctxFor(decision.tool, decision.args) : {};
      const startedAt = Date.now();
      const result = await ToolGateway.invoke(decision.tool, decision.args, ctx);
      // Timed on both paths: a slow FAILURE (timeout, long HITL wait) is precisely what a latency
      // metric has to show. This is the live agent loop, so it is the number that matters most.
      const durationMs = Math.max(0, Date.now() - startedAt);
      const outcome: StepOutcome = isToolError(result)
        ? { stepId: `r${String(step)}`, tool: decision.tool, args: decision.args, ok: false, error: result, durationMs }
        : { stepId: `r${String(step)}`, tool: decision.tool, args: decision.args, ok: true, result, durationMs };
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

      // A successful call on this tool means the agent recovered — it is not stuck in a same-kind
      // failure loop, which is the only thing the recovery budget exists to stop. Refresh that tool's
      // budget so a fresh, self-correctable error LATER (e.g. one malformed-args click after several
      // good calls) is fed back and retried rather than ending the whole run. Measured on the AI-1
      // harness: an agent that fumbled `browser_update_page` args twice, corrected itself, filled the
      // form, then fumbled the Save click once had the run killed on that single fresh error — the
      // accumulated (never-reset) counter, not a genuine loop. Fail-closed still holds for a tool that
      // ONLY ever errors (its budget never gets a success to refresh it).
      for (const key of [...recoveryCounts.keys()]) {
        if (key.endsWith(`:${outcome.tool}`)) recoveryCounts.delete(key);
      }

      const halt = outcome.ok ? options.guard?.(outcome) : null;
      if (halt != null) return { outcomes, stoppedReason: halt };

      pushObservation(`Observation:\n${observationOf(outcome)}`);

      // AI-7 navigation grounding: after the observation, surface a deterministic steer toward a route the
      // agent can see/verify (visible link / sitemap-backed path). Best-effort and time-boxed so a slow
      // discovery never stalls the loop; the hint is a short steer, so it is pushed as a plain message
      // (NOT via pushObservation — it must never be mistaken for a large page-state blob and evict the real
      // element snapshot just read). Only a hint that differs from the last one is injected.
      if (options.groundNavigation !== undefined) {
        const hint = await boundedGrounding(options.groundNavigation, outcome, req.goal);
        if (signalAborted(options.signal)) return { outcomes, stoppedReason: 'aborted' };
        if (hint !== null && hint.length > 0 && hint !== lastNavHint) {
          lastNavHint = hint;
          messages.push({ role: 'user', content: hint });
        }
      }
    }
  }
}
