import { registerAgentIpc } from './ipc-agent';
import { registerTabsWindowsIpc } from './ipc-tabs-windows';
import { registerContentIpc } from './ipc-content';

export { abortActiveAgentRuns } from './ipc-agent';

/** Register every typed IPC handler. The IPC layer lives in this `ipc/` folder, split by domain
 *  (ADR-0010 250-line cap): agent run/config/HITL (`./ipc-agent`), window/tabs/tab-groups/native-menus/
 *  popups (`./ipc-tabs-windows`), and everything else — prefs/credentials/MCP/extensions/notifications/
 *  history/bookmarks/user-agent/popup-blocker/macros/local-models (`./ipc-content`). Shared low-level
 *  wiring helpers are in `./ipc-helpers`. */
export function registerIpc(): void {
  registerAgentIpc();
  registerTabsWindowsIpc();
  registerContentIpc();
}
