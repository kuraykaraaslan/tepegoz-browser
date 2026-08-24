import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { PolicyKernel } from '@tepegoz/security-policy';
import type { AgentCapabilityRow } from '@tepegoz/desktop-ipc';

/**
 * The per-agent permission matrix, computed by ASKING the Policy Kernel rather than by reading a
 * second table.
 *
 * That is the whole design. The kernel is the single place that decides what an agent may do; a matrix
 * assembled from its own copy of the rules would be a second opinion, and the first time the two
 * disagreed the user would be reading a UI that confidently contradicted the thing actually in force.
 * So each row is a real `PolicyKernel.evaluate` call on the registered descriptor.
 *
 * Evaluated with `taintedArgs: false` and no target URL — the BASELINE verdict, what the tool does when
 * nothing has made it more dangerous. A tainted argument or a sensitive site can only ever tighten the
 * result, so this is the most permissive answer the kernel will give and therefore the honest ceiling to
 * display. The subtitle in the UI says so; a matrix that showed a best case as if it were the only case
 * would be the sort of reassurance this repo keeps refusing to write.
 */
export function agentCapabilityMatrix(): AgentCapabilityRow[] {
  return CapabilityRegistry.list()
    .map((descriptor) => {
      const verdict = PolicyKernel.evaluate({
        descriptor: { id: descriptor.id, dangerClass: descriptor.dangerClass },
        taintedArgs: false,
      });
      return {
        id: descriptor.id,
        dangerClass: descriptor.dangerClass,
        decision: verdict.decision,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
