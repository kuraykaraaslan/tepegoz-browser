import { registerAgentIpc } from './ipc-agent';
import { registerTabsWindowsIpc } from './ipc-tabs-windows';
import { registerFindIpc } from './ipc-find';
import { registerProcessIpc } from './ipc-process';
import { registerContentIpc } from './ipc-content';
import { registerDownloadsIpc } from './ipc-downloads';
import { registerUploadsIpc } from './ipc-uploads';
import { registerTasksIpc } from './ipc-tasks';
import { registerSiteDataIpc } from './ipc-site-data';
import { registerPageInfoIpc } from './ipc-page-info';
import { registerNetworkIpc } from './ipc-network';
import { registerTrustIpc } from './ipc-trust';
import { registerTabDragIpc } from '../tab-drag-coordinator';

export { abortActiveAgentRuns } from './ipc-agent';

/** Register every typed IPC handler. The IPC layer lives in this `ipc/` folder, split by domain
 *  (ADR-0010 250-line cap): agent run/config/HITL (`./ipc-agent`), window/tabs/tab-groups/native-menus/
 *  popups (`./ipc-tabs-windows`), find-in-page (`./ipc-find`), and everything else — prefs/credentials/MCP/extensions/notifications/
 *  history/bookmarks/user-agent/popup-blocker/macros/local-models (`./ipc-content`). Shared low-level
 *  wiring helpers are in `./ipc-helpers`. */
export function registerIpc(): void {
  registerAgentIpc();
  registerTabsWindowsIpc();
  registerFindIpc();
  registerProcessIpc();
  registerTabDragIpc();
  registerContentIpc();
  registerDownloadsIpc();
  registerUploadsIpc();
  registerTasksIpc();
  registerSiteDataIpc();
  registerPageInfoIpc();
  registerNetworkIpc();
  registerTrustIpc();
}
