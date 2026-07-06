import { IpcChannels, type DownloadRecord } from '@tepegoz/desktop-ipc';
import { DownloadCommandInputSchema } from '@tepegoz/desktop-ipc/schemas';
import DownloadService from '../downloads/download-service.electron';
import { handle, handleAsync } from './ipc-helpers';

/** Browser-download IPC domain. Records are redacted for renderer use; commands are id-addressed and
 *  executed by the main-process DownloadService. */
export function registerDownloadsIpc(): void {
  handle(IpcChannels.downloadsList, (): DownloadRecord[] => DownloadService.list());
  handleAsync(IpcChannels.downloadsCommand, async (_event, payload): Promise<void> => {
    const { id, action } = DownloadCommandInputSchema.parse(payload);
    await DownloadService.command(id, action);
  });
}
