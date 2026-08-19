import { Logger } from '@tepegoz/libs';
import type { PlanApprovalDecision } from './agent-service.electron';

/**
 * The outstanding-HITL registry: the authoritative record, held in **main**, of which approvals and
 * plan previews the main process actually asked a human about.
 *
 * The renderer is untrusted. It may display a request and relay a click, but every response it sends
 * has to be matched against a request main genuinely minted — otherwise a doctored renderer could
 * simply emit approvals nobody asked for. That correlation is the whole job of this module, kept free
 * of Electron imports so it is unit-testable off the main process.
 *
 * Two properties make the correlation sound:
 *
 * 1. **Ids are unguessable** (`randomUUID`, minted in `ipc-agent-run.ts`). A sequential counter would
 *    let a renderer spray responses for ids main had not created yet and win the race the moment one
 *    was registered.
 * 2. **Settling is single-shot.** The entry is deleted before its promise resolves, so a replayed or
 *    duplicated response finds nothing and is rejected.
 *
 * A rejected response is logged rather than thrown: it is either a benign late answer (the request
 * already timed out and fail-safe-denied) or a renderer misbehaving, and neither should take the run
 * down. The log is the audit trail.
 */

/**
 * What a settled approval carries. `remember` is the user asking for a persistent grant (S9); main
 * still decides whether that is allowed — the renderer relays the tick, it does not grant anything.
 */
export interface ApprovalOutcome {
  approved: boolean;
  remember: boolean;
}

export const pendingApprovals = new Map<
  string,
  { runId: string; resolve: (outcome: ApprovalOutcome) => void }
>();
export const pendingPlans = new Map<
  string,
  { runId: string; resolve: (decision: PlanApprovalDecision) => void }
>();

/**
 * Settle a tool approval the renderer answered.
 *
 * @returns `true` if the response matched an outstanding request and was applied; `false` if it was
 * rejected because main never asked for it (or already settled it).
 */
export function settleApproval(approvalId: string, approved: boolean, remember = false): boolean {
  const entry = pendingApprovals.get(approvalId);
  if (entry === undefined) {
    Logger.warn('Rejected approval response for an unknown or already-settled request', {
      approvalId,
    });
    return false;
  }
  pendingApprovals.delete(approvalId);
  entry.resolve({ approved, remember });
  return true;
}

/**
 * Settle a plan preview the renderer answered. Same correlation rule as {@link settleApproval}.
 *
 * @returns `true` if applied, `false` if rejected as uncorrelated.
 */
export function settlePlan(
  planId: string,
  approved: boolean,
  skipStepIds?: readonly string[],
): boolean {
  const entry = pendingPlans.get(planId);
  if (entry === undefined) {
    Logger.warn('Rejected plan response for an unknown or already-settled preview', { planId });
    return false;
  }
  pendingPlans.delete(planId);
  entry.resolve(skipStepIds !== undefined ? { approved, skipStepIds: [...skipStepIds] } : { approved });
  return true;
}
