import { Logger } from '@tepegoz/libs';
import type { CanonMessage } from '@tepegoz/model-gateway';
import type { AgentWorkingState } from '@tepegoz/shared-types';
import type { ProgressSignal } from './reactor-progress';
import type { ReactOptions, ReactRequest } from './reactor-types';

/** What the replanner reads from the running reactor (by reference or live getter, never copied). */
export interface ReplannerDeps {
  req: ReactRequest;
  replan: ReactOptions['replan'];
  messages: CanonMessage[];
  /** Live reads of the loop's current ledger, so a replan always sees the latest of each. */
  workingState: () => AgentWorkingState;
  memory: () => string;
  recentObservations: () => string[];
  noProgressThreshold: number;
  maxReplans: number;
}

/**
 * C1 PR2: run-level no-progress counter + the bounded replan pass it triggers. `observe` folds each
 * outcome's progress signal in; `maybeReplan` (called at the loop top) acts on it.
 */
export interface Replanner {
  /** Fold a progress signal in: progress resets the stall count, a stall extends it, neutral is a no-op. */
  observe(signal: ProgressSignal): void;
  /** An escape attempt is a hard no-progress event: force the stall count to the threshold. */
  forceStall(): void;
  /**
   * When the run has stalled — `noProgressThreshold` state-changing actions with no observable
   * page-state change — and the replan budget remains, ask the hook for a genuinely NEW approach and
   * inject it as a steer. Fail-open: a hook error is logged and the run simply continues.
   */
  maybeReplan(): Promise<void>;
}

export function createReplanner(deps: ReplannerDeps): Replanner {
  const { req, replan, messages, noProgressThreshold, maxReplans } = deps;
  let noProgressActs = 0;
  let replanCount = 0;

  return {
    observe(signal) {
      if (signal === 'progress') noProgressActs = 0;
      else if (signal === 'stall') noProgressActs += 1;
    },

    forceStall() {
      noProgressActs = Math.max(noProgressActs, noProgressThreshold);
    },

    async maybeReplan() {
      if (
        replan === undefined ||
        noProgressActs < noProgressThreshold ||
        replanCount >= maxReplans
      ) {
        return;
      }
      replanCount += 1;
      const reason = `No observable page-state change across ${String(noProgressActs)} acting steps.`;
      // C1 engagement signal (diagnostic): the no-progress detector tripped and PR2's replan is firing.
      Logger.info('[c1] no-progress replan fired', { replanCount, reason });
      noProgressActs = 0; // give the new approach a fresh no-progress budget
      let guidance = '';
      try {
        const res = await replan({
          goal: req.goal,
          workingState: deps.workingState(),
          memory: deps.memory(),
          recentObservations: deps.recentObservations(),
          reason,
        });
        if (res !== null) guidance = res.guidance;
      } catch (err) {
        Logger.warn('replan hook failed; continuing without a new plan', { err: String(err) });
        return;
      }
      if (guidance.length > 0) {
        messages.push({
          role: 'user',
          content:
            'Replan: the actions you have tried are not moving the page toward the goal. Do NOT keep ' +
            `repeating them. Try this DIFFERENT approach instead:\n${guidance}`,
        });
      }
    },
  };
}
