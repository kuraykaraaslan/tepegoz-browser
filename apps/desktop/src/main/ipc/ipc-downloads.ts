import { IpcChannels, type DownloadRecord } from '@tepegoz/desktop-ipc';
import { DownloadCommandInputSchema } from '@tepegoz/desktop-ipc/schemas';
import DownloadService from '../downloads/download-service.electron';
import TabManager from '../tabs';
import { handle, handleAsync } from './ipc-helpers';

/** Browser-download IPC domain. Records are redacted for renderer use; commands are id-addressed and
 *  executed by the main-process DownloadService. */
export function registerDownloadsIpc(): void {
  handle(IpcChannels.downloadsList, (): DownloadRecord[] => DownloadService.list());
  handleAsync(IpcChannels.downloadsCommand, async (event, payload): Promise<void> => {
    const { id, action } = DownloadCommandInputSchema.parse(payload);
    // `retry` restarts the transfer and needs a live page to attach it to; the others are
    // id-addressed and ignore this. Resolve the sender window's active tab.
    const wc = TabManager.forSender(event.sender)?.activeWebContents() ?? null;
    await DownloadService.command(id, action, wc);
  });
}
