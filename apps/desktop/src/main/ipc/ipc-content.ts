import { registerAppIpc } from './ipc-content-app';
import { registerBrowsingIpc } from './ipc-content-browsing';
import { registerExtensionsIpc } from './ipc-content-extensions';
import { registerToolsIpc } from './ipc-content-tools';

/**
 * App info/preferences + credentials + MCP/AI-adaptors/extensions + notifications + history +
 * bookmarks + user-agent + popup-blocker + macros + local-models IPC domain (split out of `ipc.ts`,
 * ADR-0010 250-line cap). This facade composes the per-concern registrars in `ipc-content-*.ts`;
 * the registrar helpers own the individual handlers.
 */

/** Register the app-info/preferences/credentials/MCP/extensions/notifications/history/bookmarks/
 *  user-agent/popup-blocker/macros/local-models IPC handlers. */
export function registerContentIpc(): void {
  registerAppIpc();
  registerBrowsingIpc();
  registerExtensionsIpc();
  registerToolsIpc();
}
