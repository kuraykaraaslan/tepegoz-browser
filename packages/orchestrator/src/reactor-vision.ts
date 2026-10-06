import { Logger } from '@tepegoz/libs';
import type { VisionEscalation } from '@tepegoz/shared-types';
import type { StepOutcome } from './executor';
import { evaluateVisionTrigger } from './vision-trigger';
import type { ConversationWindow } from './reactor-window';
import type { ReactOptions } from './reactor-types';

/**
 * S10 PR2: is this step BLIND — i.e. would a correct DOM read still leave nothing to act on?
 * Deterministic and pre-model, and observation-only: nothing is captured, and nothing is injected
 * into the conversation, so recording an escalation cannot itself change the run. The same reason
 * is not recorded twice in a row — an unchanged blind page is one escalation, not one per step.
 */
export async function handleVisionStep(
  outcomes: readonly StepOutcome[],
  visionEscalations: VisionEscalation[],
  options: ReactOptions,
  thread: ConversationWindow,
): Promise<void> {
  const escalation = evaluateVisionTrigger(outcomes);
  if (escalation === null || escalation.reason === visionEscalations.at(-1)?.reason) return;
  visionEscalations.push(escalation);
  Logger.info('[s10] vision escalation', escalation);
  options.onVisionEscalation?.(escalation);
  // Fallback-ONLY: this is the sole call site, reached only when a trigger fired. An ordinary step
  // has no path to a screenshot, which is what the Never-list clause requires.
  if (options.captureVision === undefined) return;
  const blocks = await options.captureVision(escalation).catch((err: unknown) => {
    // A failed capture degrades the step; it must never end the run.
    Logger.warn('[s10] vision capture failed; continuing without it', { err: String(err) });
    return null;
  });
  if (blocks !== null && blocks.length > 0) thread.pushImage(blocks);
}
