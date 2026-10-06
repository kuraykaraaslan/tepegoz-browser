import type { CanonContentBlock, CanonMessage } from '@tepegoz/model-gateway';
import type { AgentWorkingState } from '@tepegoz/shared-types';
import { Logger } from '@tepegoz/libs';
import { stableIndexBefore } from './cache-window';
import {
  COLLAPSED_IMAGE_PLACEHOLDER,
  COLLAPSED_STATE_PLACEHOLDER,
  STATE_COLLAPSE_THRESHOLD,
} from './reactor-page-state';
import {
  COLLAPSED_WORKING_STATE_PLACEHOLDER,
  WORKING_STATE_HEADER,
  isWorkingStateEmpty,
  renderWorkingState,
} from './reactor-working-state';

/**
 * The reactor's conversation window: owns the in-place collapse of the three transient message kinds
 * (large page-state observation, typed working-state ledger, vision screenshot) and the prompt-cache
 * breakpoint that depends on where those live indices sit. `messages` is the same array the loop pushes
 * plain messages onto.
 */
export interface ConversationWindow {
  /** Push an observation; a large one collapses the previous large one in place. */
  pushObservation(content: string): void;
  /** Re-inject the typed working ledger at the tail, collapsing the previous copy (no-op while empty). */
  syncWorkingState(workingState: AgentWorkingState): void;
  /** Push a vision screenshot, collapsing the previous live one in place. */
  pushImage(blocks: CanonContentBlock[]): void;
  /** The last message index this run promises never to rewrite — the prompt-cache breakpoint. */
  cacheStableIndex(): number | null;
}

export function createConversationWindow(messages: CanonMessage[]): ConversationWindow {
  // Transient page-state (AI-3): keep only the LATEST large observation live. When a new page-state
  // blob is fed back, the previous one is collapsed to a placeholder so DOM dumps never accumulate
  // across a long run — the compact decisions (with their `memory`) remain the persistent history.
  let lastStateIndex: number | null = null;
  let workingStateIndex: number | null = null;
  // S7 context eviction: same collapse-in-place pattern as page-state, applied to S10's vision-
  // escalation images — the single most expensive thing this loop can put in a prompt.
  let lastImageIndex: number | null = null;
  /**
   * The last message index this run promises never to rewrite — the prompt-cache breakpoint.
   *
   * Both collapses below mutate a message IN PLACE, and prompt caching is a prefix match, so a
   * breakpoint at the tail would be invalidated on every single step: the cache-write premium would
   * be paid for a 0% hit rate, which costs more than not caching at all. Everything strictly before
   * the two live indices is already collapsed (or was never collapsible) and is safe forever.
   *
   * Recomputed wherever either index moves, so the promise can never drift from the mutation that
   * would break it.
   */
  let cacheStableIndex: number | null = null;

  return {
    pushObservation(content) {
      const isState = content.length > STATE_COLLAPSE_THRESHOLD;
      if (isState && lastStateIndex !== null) {
        const prev = messages[lastStateIndex];
        if (prev !== undefined)
          messages[lastStateIndex] = { ...prev, content: COLLAPSED_STATE_PLACEHOLDER };
      }
      messages.push({ role: 'user', content });
      if (isState) lastStateIndex = messages.length - 1;
      cacheStableIndex = stableIndexBefore(lastStateIndex, workingStateIndex, lastImageIndex);
    },

    // C1: re-inject the typed working ledger as a compact persistent block at the tail, collapsing the
    // previous copy (mirrors the transient page-state collapse) so only the CURRENT ledger stays live and
    // the model always sees up-to-date structured progress. No-op while the ledger is empty (legacy path).
    syncWorkingState(workingState) {
      if (isWorkingStateEmpty(workingState)) return;
      const firstInjection = workingStateIndex === null;
      if (workingStateIndex !== null) {
        const prev = messages[workingStateIndex];
        if (prev !== undefined)
          messages[workingStateIndex] = { ...prev, content: COLLAPSED_WORKING_STATE_PLACEHOLDER };
      }
      messages.push({
        role: 'user',
        content: `${WORKING_STATE_HEADER}\n${renderWorkingState(workingState)}`,
      });
      workingStateIndex = messages.length - 1;
      cacheStableIndex = stableIndexBefore(lastStateIndex, workingStateIndex, lastImageIndex);
      // C1 engagement signal (diagnostic): the model actually emitted a typed `state` and it is now being
      // fed back. Logged ONCE per run so a sweep transcript can PROVE PR1 engaged (vs the model ignoring it).
      if (firstInjection)
        Logger.info('[c1] typed working-state injected (model emitted structured `state`)');
    },

    pushImage(blocks) {
      // S7 context eviction: collapse the previous live screenshot in place before appending the
      // new one, mirroring pushObservation's page-state collapse — only the LATEST image stays at
      // full fidelity, so a long run's images never accumulate.
      if (lastImageIndex !== null) {
        const prev = messages[lastImageIndex];
        if (prev !== undefined)
          messages[lastImageIndex] = { ...prev, content: COLLAPSED_IMAGE_PLACEHOLDER };
      }
      messages.push({ role: 'user', content: blocks });
      lastImageIndex = messages.length - 1;
      cacheStableIndex = stableIndexBefore(lastStateIndex, workingStateIndex, lastImageIndex);
    },

    cacheStableIndex: () => cacheStableIndex,
  };
}
