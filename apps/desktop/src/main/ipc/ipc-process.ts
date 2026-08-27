import { IpcChannels, type ProcessSnapshot } from '@tepegoz/desktop-ipc';
import { ProcessEndInputSchema } from '@tepegoz/desktop-ipc/schemas';
import { collectProcessSnapshot, endTabProcess } from '../process-metrics.electron';
import { handle, onAction } from './ipc-helpers';

/**
 * Task-manager IPC (`tepegoz://process`). `get` is an invoke the page polls itself (no push); `end`
 * is a fire-and-forget that force-crashes one tab's renderer. Both are read-only w.r.t. persisted
 * state, so they take no window scope — the snapshot spans every window's process tree by design.
 */
export function registerProcessIpc(): void {
  handle(IpcChannels.processMetricsGet, (): ProcessSnapshot => collectProcessSnapshot());
  onAction(IpcChannels.processMetricsEnd, ProcessEndInputSchema, ({ tabId }) => {
    endTabProcess(tabId);
  });
}
