import { Logger } from '@tepegoz/libs';
import type { CanonMessage } from '@tepegoz/model-gateway';
import { ToolGateway } from '@tepegoz/capability-plane';
import { wrapUserRequest } from '@tepegoz/tool-executor';
import { DEFAULT_AGENT_MAX_STEPS } from '@tepegoz/shared-types';
import type { AgentWorkingState, VisionEscalation } from '@tepegoz/shared-types';
import type { StepOutcome } from './executor';
import {
  classifyRuntimeError,
  classifyToolFailure,
  recoveryAdviceFor,
  stopReasonForFailure,
} from './recovery';
import type { Decision } from './reactor-decision';
import { resolveDecisionMode } from './reactor-decision-mode';
import { requestDecision } from './reactor-decide';
import {
  isToolError,
  observationOf,
  observationWithRecovery,
  stableStringify,
} from './reactor-observation';
import { mergeWorkingState } from './reactor-working-state';
import { isQuickModeEnabled } from './quick-decision';
import { cadenceBounds } from './should-validate';
import { createProgressTracker } from './reactor-progress';
import { systemPrompt } from './reactor-prompt';
import { createCompletionAuthority } from './reactor-completion';
import {
  boundedGrounding,
  createReadStreakGuard,
  signalAborted,
  urlFromOutcome,
} from './reactor-guards';
import { createReplanner } from './reactor-replan';
import { handleVisionStep } from './reactor-vision';
import { createConversationWindow } from './reactor-window';
import type { ReactOptions, ReactRequest, ReactResult } from './reactor-types';

/**
 * L3 reactive executor — the perceive → decide → act loop. Unlike the static {@link Executor} (which
 * runs a plan fixed *before* the page is seen), the reactor asks the model for the NEXT single tool call
 * given the goal + everything observed so far, runs it through the single ToolGateway PEP (Policy Kernel
 * + HITL), feeds the observation back, and repeats. Same Phase-1a safeguards: hard `maxSteps` cap, Loop
 * Detector, abort, and a post-step guard (Human Handoff Controller). The model's output is UNTRUSTED —
 * every decision is JSON-extracted + zod-validated and the chosen tool must be registered before it runs.
 * The decision boundary, observation/transient-page-state helpers, prompt, and public types live in the
 * sibling `reactor-*` modules (decide, thread, completion, replan, vision, guards); this file is the loop
 * itself plus the re-exports that keep the surface unchanged.
 */

// Re-export the full public surface so existing importers of './reactor' are unaffected.
export {
  coerceDecisionShape,
  parseDecision,
  parseNativeDecision,
  type Decision,
} from './reactor-decision';
export {
  DECISION_TOOL_NAME,
  decisionToolDef,
  resolveDecisionMode,
  type DecisionMode,
} from './reactor-decision-mode';
export { createReadStreakGuard } from './reactor-guards';
export type {
  CompletionContext,
  CompletionVerdict,
  ReactOptions,
  ReactRequest,
  ReactResult,
  ReplanContext,
  ReplanResult,
} from './reactor-types';

export default class Reactor {
  static async run(req: ReactRequest, options: ReactOptions = {}): Promise<ReactResult> {
    const maxSteps = options.maxSteps ?? DEFAULT_AGENT_MAX_STEPS;
    const loopThreshold = options.loopThreshold ?? 3;
    const known = new Set(req.tools.map((t) => t.id));
    // Idempotent read-only tools (perception/verification, dangerClass 'read') are EXEMPT from the loop
    // detector below: re-reading the page after each action is the encouraged state-every-step pattern, and
    // because `signatureCounts` is run-global (non-consecutive) counting them would trip a healthy
    // multi-step task on its 3rd identical re-read. A read-only spin is still bounded by `maxSteps`.
    const readOnlyTools = new Set(
      req.tools.filter((t) => t.dangerClass === 'read').map((t) => t.id),
    );
    const outcomes: StepOutcome[] = [];
    const signatureCounts = new Map<string, number>();
    const loopNudged = new Set<string>();
    // M1: identical-consecutive-read guard (see `createReadStreakGuard`).
    const readStreak = createReadStreakGuard(options.readLoopThreshold ?? 5);
    const recoveryCounts = new Map<string, number>();
    const maxDecisionRepairs = options.maxDecisionRepairs ?? 2;
    // S1: pick the decision transport ONCE per run, so a run cannot straddle both arms mid-sweep.
    // Everything else about the two arms is byte-identical — same system prompt, same Decision shape,
    // same zod settle step — which is what makes a paired completion delta attributable to transport.
    const decisionMode = resolveDecisionMode(req.provider, options.decisionMode);
    // S7 PR4: resolved ONCE per run, like the decision transport, so a run cannot straddle both
    // encodings mid-sweep. Off for every provider unless TEPEGOZ_QUICK_MODE names it.
    const quickMode = isQuickModeEnabled(req.provider);
    const maxRecoveryAttempts = options.maxRecoveryAttempts ?? 2;
    // S7: the periodic validator pass is signal-driven, not modulo-driven. `planningInterval` is now
    // the FLOOR (never validate more often than the old fixed cadence) and twice it is the ceiling
    // (a frozen page still gets judged). No new budget — see should-validate.ts for why the floor is
    // what makes this change safe without a sweep.
    const cadence = cadenceBounds(options.planningInterval ?? 3);
    // C1 PR2 (s14): run-level no-progress detection. `progress` classifies each outcome; the replanner
    // counts consecutive state-changing actions that moved nothing; past the threshold a single bounded
    // replan pass injects a NEW approach instead of grinding on / failing closed.
    const progress = createProgressTracker();
    const noProgressThreshold = Math.max(2, options.noProgressThreshold ?? 6);
    let decisionRepairs = 0;
    // C1 (s15): the actor's TYPED working ledger — the authoritative merge of every `state` patch it has
    // proposed. Injected as a compact persistent block re-rendered at the tail each step (see
    // `ConversationWindow.syncWorkingState`) so structured progress survives the transient page-state
    // collapse, instead of riding free-text `memory` prose that gets buried and lost.
    let workingState: AgentWorkingState = {};
    // AI-7: the last navigation-grounding hint injected, so an identical steer is not re-pushed every read.
    let lastNavHint = '';
    // S10: every escalation this run judged, so the rate can be reported.
    const visionEscalations: VisionEscalation[] = [];
    // S9: the host whose notes have already been injected this run.
    let recalledHost: string | null = null;

    const messages: CanonMessage[] = [
      { role: 'system', content: systemPrompt(req, quickMode) },
      ...(req.history ?? []),
      { role: 'user', content: `Goal:\n${wrapUserRequest(req.goal)}` },
    ];
    const thread = createConversationWindow(messages);
    const completion = createCompletionAuthority({
      req,
      validator: options.validateCompletion,
      outcomes,
      visionEscalations,
      messages,
      progress,
      cadence,
      maxCompletionRejects: options.maxCompletionRejects ?? 3,
    });
    const replanner = createReplanner({
      req,
      replan: options.replan,
      messages,
      workingState: () => workingState,
      memory: () => completion.memory(),
      recentObservations: () => completion.recentObservations(),
      noProgressThreshold,
      maxReplans: options.maxReplans ?? 2,
    });

    for (let step = 0; ; step++) {
      if (options.signal?.aborted === true)
        return { outcomes, visionEscalations, stoppedReason: 'aborted' };
      // Run-control gate (additive; skipped entirely when `control` is absent — byte-identical legacy
      // path): hold the loop while paused-by-user or offline, then fold any mid-run steering messages the
      // user injected into the conversation before the next decision. Abort always wins over a hold.
      if (options.control !== undefined) {
        await options.control.waitWhileHeld();
        if (options.control.aborted)
          return { outcomes, visionEscalations, stoppedReason: 'aborted' };
        for (const steer of options.control.drainSteer()) {
          messages.push({
            role: 'user',
            content: `New instruction from the user (mid-run): ${wrapUserRequest(steer)}\nFold this into your current work; do NOT restart from scratch.`,
          });
        }
      }
      if (outcomes.length >= maxSteps) {
        const lastOutcome = completion.lastOutcome();
        const lastEvidence = completion.lastEvidence();
        return {
          outcomes,
          visionEscalations,
          stoppedReason: 'max_steps',
          ...(lastOutcome !== undefined
            ? {
                completionOutcome: lastOutcome,
                ...(lastEvidence !== undefined ? { evidence: lastEvidence } : {}),
              }
            : {}),
        };
      }

      // Periodic validator pass (AI-3): every `planningInterval` actions the Planner checks whether the
      // goal is already met — catching an actor stuck acting past completion.
      const periodicDone = await completion.periodicCheck();
      if (periodicDone !== null) return periodicDone;

      // C1 PR2: if the run has stalled, inject a fresh approach BEFORE the next decision (bounded + fail-open).
      await replanner.maybeReplan();

      // C1: refresh the typed working ledger at the tail so THIS decision reasons over up-to-date
      // structured progress (no-op on the first step / whenever the ledger is still empty).
      thread.syncWorkingState(workingState);

      let responseText: string;
      let decision: Decision;
      try {
        ({ decision, responseText } = await requestDecision({
          req,
          options,
          messages,
          decisionMode,
          quickMode,
          cacheStableIndex: thread.cacheStableIndex(),
        }));
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
        return {
          outcomes,
          visionEscalations,
          stoppedReason: stopReasonForFailure(failure),
          failure,
        };
      }
      decisionRepairs = 0;
      messages.push({ role: 'assistant', content: responseText });
      if (decision.memory !== undefined && decision.memory.length > 0)
        completion.setMemory(decision.memory);
      // C1: fold the model's proposed ledger update into the authoritative snapshot. A malformed patch was
      // already dropped to `undefined` at the decision boundary (`.catch`), so `state` here is valid-or-absent;
      // an absent patch carries the prior ledger forward via the field-level merge.
      if (decision.state !== undefined)
        workingState = mergeWorkingState(workingState, decision.state);

      if (decision.action === 'finish') {
        const settled = await completion.settleClaim(decision.summary);
        if (settled !== null) return settled;
        continue;
      }

      // The model's tool choice is untrusted — an unregistered id is fed back as an error, never run.
      if (!known.has(decision.tool)) {
        messages.push({
          role: 'user',
          content: `Observation: unknown tool "${decision.tool}". Choose a listed tool.`,
        });
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
        thread.pushObservation(
          `Observation: You have made the exact same ${decision.tool} read several times in a row. ` +
            'Re-reading an unchanged page again will not produce new information. ACT instead: ' +
            'click/fill/scroll toward the goal, or finish with what you know. If you are waiting for ' +
            'content to load, use browser_validate_page (it waits) instead of re-reading. Do NOT ' +
            'repeat this exact read.',
        );
        continue;
      }
      if (streakVerdict === 'stop') {
        return { outcomes, visionEscalations, stoppedReason: 'loop_detected' };
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
            thread.pushObservation(
              `Observation: You have chosen ${decision.tool} with identical arguments ${String(count)} ` +
                'times without moving toward the goal. It may ALREADY have taken effect (e.g. the menu / ' +
                'panel you are toggling is already open) or the ref may be stale — verify by re-reading ' +
                'browser_get_elements (scroll first if the target may be off-screen) rather than assuming. Then act on a ' +
                'DIFFERENT element to advance the goal; do NOT repeat this exact call.',
            );
            continue;
          }
          return { outcomes, visionEscalations, stoppedReason: 'loop_detected' };
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
        ? {
            stepId: `r${String(step)}`,
            tool: decision.tool,
            args: decision.args,
            ok: false,
            error: result,
            durationMs,
          }
        : {
            stepId: `r${String(step)}`,
            tool: decision.tool,
            args: decision.args,
            ok: true,
            result,
            durationMs,
          };
      outcomes.push(outcome);
      options.onOutcome?.(outcome);

      // S9: the page may have changed host. Recall is per HOST and once each — re-injecting the same
      // notes every step would spend the token budget memory exists to save.
      const arrivedAt = urlFromOutcome(outcome);
      if (options.recallMemory !== undefined && arrivedAt !== null && arrivedAt !== recalledHost) {
        recalledHost = arrivedAt;
        const recalled = await options.recallMemory(arrivedAt).catch((err: unknown) => {
          // Memory is advisory: a failed recall is a quieter run, never a failed one.
          Logger.warn('[s9] memory recall failed; continuing without it', { err: String(err) });
          return null;
        });
        if (recalled !== null && recalled.length > 0) thread.pushObservation(recalled);
      }

      await handleVisionStep(outcomes, visionEscalations, options, thread);

      // C1 PR2: fold this outcome into the run-level no-progress counter (a state-changing action that
      // moved nothing is a 'stall'; a read of an unchanged page is neutral). `maybeReplan` at the loop top
      // acts on it. Reads never stall — re-reading is the encouraged pattern (bounded by the streak guard).
      replanner.observe(progress.observe(outcome, readOnlyTools.has(decision.tool)));

      // C1 PR3: an escape attempt (web search / off-origin nav) is the failure mode the stall detector is
      // blind to — an escape via a read-class tool reads as 'neutral', so the agent wanders off unpunished
      // (the verified cause of C1's first-sweep miss). Treat it as a hard no-progress event so `maybeReplan`
      // fires next step and the Replanner steers back on-page, rather than letting the escape stand.
      if (outcome.ok && options.isEscapeTool?.(decision.tool, decision.args) === true) {
        replanner.forceStall();
        Logger.info('[c1] escape attempt detected → forcing replan', { tool: decision.tool });
      }

      // A policy/HITL denial is the user's hard "no" → stop. Recoverable failures are fed back with
      // a concrete recovery hint, but repeated same-kind failures fail closed instead of looping.
      if (!outcome.ok) {
        const failure = classifyToolFailure(outcome);
        if (!failure.retryable) {
          return {
            outcomes,
            visionEscalations,
            stoppedReason: stopReasonForFailure(failure),
            failure,
          };
        }
        const key = `${failure.kind}:${outcome.tool}`;
        const recoveryCount = (recoveryCounts.get(key) ?? 0) + 1;
        recoveryCounts.set(key, recoveryCount);
        if (recoveryCount > maxRecoveryAttempts) {
          return {
            outcomes,
            visionEscalations,
            stoppedReason: stopReasonForFailure(failure),
            failure,
          };
        }
        thread.pushObservation(`Observation:\n${observationWithRecovery(outcome, failure)}`);
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
      if (halt != null) return { outcomes, visionEscalations, stoppedReason: halt };

      thread.pushObservation(`Observation:\n${observationOf(outcome)}`);

      // AI-7 navigation grounding: after the observation, surface a deterministic steer toward a route the
      // agent can see/verify (visible link / sitemap-backed path). Best-effort and time-boxed so a slow
      // discovery never stalls the loop; the hint is a short steer, so it is pushed as a plain message
      // (NOT via pushObservation — it must never be mistaken for a large page-state blob and evict the real
      // element snapshot just read). Only a hint that differs from the last one is injected.
      if (options.groundNavigation !== undefined) {
        const hint = await boundedGrounding(options.groundNavigation, outcome, req.goal);
        if (signalAborted(options.signal))
          return { outcomes, visionEscalations, stoppedReason: 'aborted' };
        if (hint !== null && hint.length > 0 && hint !== lastNavHint) {
          lastNavHint = hint;
          messages.push({ role: 'user', content: hint });
        }
      }
    }
  }
}
