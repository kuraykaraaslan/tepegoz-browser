import { abortAllAgentRunControllers } from '../agent/agent-run-lock.electron';
import { agentRunByGroup, pendingApprovals, pendingPlans } from './ipc-agent-shared';
import { registerAgentRunIpc } from './ipc-agent-run';
import { registerAgentControlIpc } from './ipc-agent-controls';
import { registerAgentConversationIpc } from './ipc-agent-conversations';
import { registerAgentConfigIpc } from './ipc-agent-config';

/**
 * Agent run/config + HITL (approval + plan-preview) IPC domain (split out of `ipc.ts`, ADR-0010
 * 250-line cap). This facade composes the concern registrars (run / controls / conversations / config)
 * that live in the sibling `ipc-agent-*.ts` modules; the shared per-run tracking state is owned by
 * `ipc-agent-shared.ts`. Public surface (`registerAgentIpc`, `abortActiveAgentRuns`) is unchanged.
 */

/** Abort every in-flight agent run and unblock any HITL prompt parked on a promise (fail-safe deny),
 *  so quit doesn't race a half-finished run against store/database teardown. Called from before-quit. */
export function abortActiveAgentRuns(): void {
  abortAllAgentRunControllers();
  agentRunByGroup.clear();
  for (const [id, entry] of pendingApprovals) {
    pendingApprovals.delete(id);
    entry.resolve(false);
  }
  for (const [id, entry] of pendingPlans) {
    pendingPlans.delete(id);
    entry.resolve({ approved: false });
  }
}

/** Register the agent run/config/HITL IPC handlers. */
export function registerAgentIpc(): void {
  registerAgentRunIpc();
  registerAgentControlIpc();
  registerAgentConversationIpc();
  registerAgentConfigIpc();
}
