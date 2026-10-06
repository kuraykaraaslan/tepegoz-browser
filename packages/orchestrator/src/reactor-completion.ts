import { Logger } from '@tepegoz/libs';
import type { CanonMessage } from '@tepegoz/model-gateway';
import type {
  CompletionEvidence,
  CompletionOutcome,
  VisionEscalation,
} from '@tepegoz/shared-types';
import type { StepOutcome } from './executor';
import { assembleEvidence } from './completion-evidence';
import { observationOf } from './reactor-observation';
import type { ProgressTracker } from './reactor-progress';
import { shouldValidate, type ValidationCadenceBounds } from './should-validate';
import type {
  CompletionContext,
  CompletionVerdict,
  ReactOptions,
  ReactRequest,
  ReactResult,
} from './reactor-types';

/** Everything the completion authority reads from the running reactor (all by reference, never copied). */
export interface CompletionAuthorityDeps {
  req: ReactRequest;
  validator: ReactOptions['validateCompletion'];
  outcomes: StepOutcome[];
  visionEscalations: VisionEscalation[];
  messages: CanonMessage[];
  progress: ProgressTracker;
  cadence: ValidationCadenceBounds;
  maxCompletionRejects: number;
}

/**
 * Completion authority (AI-3 PR2): the periodic validator pass and the resolution of the actor's `finish`
 * claim, plus the run-level state they share with the loop (the actor's latest progress ledger and the
 * last verdict's outcome/evidence).
 */
export interface CompletionAuthority {
  /** Periodic validator pass: end the run iff the Planner judges the goal already met. Else null. */
  periodicCheck(): Promise<ReactResult | null>;
  /**
   * Resolve the actor's `finish` CLAIM. Without a validator the claim ends the run (legacy). With one,
   * only a `done` verdict ends it (with the authoritative answer); a rejection pushes continue-guidance
   * and returns null so the loop goes on — until `maxCompletionRejects`, after which we concede to the
   * actor rather than burn the whole step budget.
   */
  settleClaim(summary: string): Promise<ReactResult | null>;
  /** The compact tail of recent observations handed to the validator / replanner as page evidence. */
  recentObservations(): string[];
  /** The actor's latest progress ledger (free-text `memory`). */
  memory(): string;
  setMemory(memory: string): void;
  /** The last completion verdict's outcome (S4) and the evidence it was judged against (S8 PR2). */
  lastOutcome(): CompletionOutcome | undefined;
  lastEvidence(): CompletionEvidence | undefined;
}

export function createCompletionAuthority(deps: CompletionAuthorityDeps): CompletionAuthority {
  const { req, validator, outcomes, visionEscalations, messages, progress, cadence } = deps;
  // Completion-authority state (AI-3 PR2): the actor's latest progress ledger, how many finish
  // CLAIMS the validator has rejected (fail-closed guard), and the action count last validated
  // (so a periodic check fires once per cadence tick, not on every no-op turn).
  let latestMemory = '';
  // S7: the world signature as of the last validation pass — the input to the adaptive cadence.
  let sigAtLastValidation: string | null = null;
  let completionRejects = 0;
  let lastValidatedCount = -1;
  // S4: the last completion verdict's outcome, so a run that ended any other way still reports what
  // the evidence said the last time it was asked.
  let lastOutcome: CompletionOutcome | undefined;
  // S8 PR2: the evidence that outcome was actually judged against, so the chip can cite it.
  let lastEvidence: CompletionEvidence | undefined;

  const recentObservations = (): string[] =>
    outcomes.slice(-3).map((o) => {
      const text = observationOf(o);
      return text.length > 500 ? `${text.slice(0, 500)}…` : text;
    });

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

  const periodicCheck = async (): Promise<ReactResult | null> => {
    if (
      validator === undefined ||
      outcomes.length === 0 ||
      outcomes.length === lastValidatedCount
    ) {
      return null;
    }
    const decision = shouldValidate(
      {
        // -1 means "never validated", so every action so far counts toward the floor.
        actionsSinceValidation:
          lastValidatedCount < 0 ? outcomes.length : outcomes.length - lastValidatedCount,
        sigAtLastValidation: sigAtLastValidation,
        currentSig: progress.worldSignature(),
      },
      cadence,
    );
    if (!decision.validate) return null;
    lastValidatedCount = outcomes.length;
    sigAtLastValidation = progress.worldSignature();
    const evidence = assembleEvidence(outcomes);
    const verdict = await validate({
      goal: req.goal,
      memory: latestMemory,
      trigger: 'periodic',
      recentObservations: recentObservations(),
      evidence,
    });
    if (!verdict.done) {
      lastOutcome = verdict.outcome;
      lastEvidence = evidence;
      return null;
    }
    return {
      outcomes,
      visionEscalations,
      stoppedReason: 'completed',
      summary: verdict.finalAnswer ?? latestMemory,
      ...(verdict.outcome !== undefined ? { completionOutcome: verdict.outcome, evidence } : {}),
    };
  };

  const settleClaim = async (summary: string): Promise<ReactResult | null> => {
    if (validator === undefined)
      return { outcomes, visionEscalations, stoppedReason: 'completed', summary };
    // S4: the claim is judged against what the run OBSERVED, not against what the page says about
    // itself. Assembled here because this is the only place that has every step outcome.
    const evidence = assembleEvidence(outcomes);
    const verdict = await validate({
      goal: req.goal,
      memory: latestMemory,
      claimedSummary: summary,
      trigger: 'claim',
      recentObservations: recentObservations(),
      evidence,
    });
    if (verdict.done) {
      return {
        outcomes,
        visionEscalations,
        stoppedReason: 'completed',
        summary: verdict.finalAnswer ?? summary,
        ...(verdict.outcome !== undefined ? { completionOutcome: verdict.outcome, evidence } : {}),
      };
    }
    lastOutcome = verdict.outcome;
    lastEvidence = evidence;
    completionRejects += 1;
    // Conceding to the actor after N rejections still carries WHY the validator kept rejecting — a
    // conceded run that the evidence never supported must not read as a clean success.
    if (completionRejects > deps.maxCompletionRejects) {
      return {
        outcomes,
        visionEscalations,
        stoppedReason: 'completed',
        summary,
        ...(verdict.outcome !== undefined ? { completionOutcome: verdict.outcome, evidence } : {}),
      };
    }
    const reason =
      verdict.reason !== undefined && verdict.reason.length > 0 ? ` — ${verdict.reason}` : '';
    messages.push({
      role: 'user',
      content:
        `Completion check: NOT done yet${reason}. Do NOT finish. Continue toward the goal (open menus, ` +
        'try other links or conventional paths, or read more of the page) and only finish once every ' +
        'part of the goal is actually satisfied.',
    });
    return null;
  };

  return {
    periodicCheck,
    settleClaim,
    recentObservations,
    memory: () => latestMemory,
    setMemory: (memory) => {
      latestMemory = memory;
    },
    lastOutcome: () => lastOutcome,
    lastEvidence: () => lastEvidence,
  };
}
