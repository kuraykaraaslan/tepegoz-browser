import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IpcChannels, type AppInfo } from '../shared/ipc-contract';
import { AppInfoSchema } from '../shared/ipc-schemas';

/** Reject IPC from frames that are not our own app content (sender allow-list). */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  const trusted = url.startsWith('file://') || url.startsWith('http://localhost');
  if (!trusted) {
    throw new Error(`Untrusted IPC sender: ${url}`);
  }
}

/** Register all typed IPC handlers. Each validates sender + output schema. */
export function registerIpc(): void {
  ipcMain.handle(IpcChannels.appGetInfo, (event): AppInfo => {
    assertTrustedSender(event);
    return AppInfoSchema.parse({
      name: 'Tepegöz',
      version: app.getVersion(),
      platform: process.platform,
    });
  });
}
