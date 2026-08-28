import { BrowserWindow, dialog, shell } from 'electron';
import { IpcChannels, type DownloadRecord } from '@tepegoz/desktop-ipc';
import { DownloadCommandInputSchema } from '@tepegoz/desktop-ipc/schemas';
import PreferenceStore from '@tepegoz/preferences';
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

  // Bulk clear in one call. `clearTerminal` already existed in main and was simply never exposed, so
  // the settings page was looping the id-addressed command instead — N round trips and N broadcasts
  // for one user action, with no count to report back.
  handle(IpcChannels.downloadsClearFinished, (): number => DownloadService.clearTerminal());

  handleAsync(
    IpcChannels.downloadsPickDirectory,
    async (event): Promise<{ path: string; cancelled: boolean }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      // Seeded with the folder in force, so the picker opens where the user already keeps downloads
      // instead of at some default they then have to navigate away from.
      const current = PreferenceStore.getAll().downloadDirectory;
      const options = {
        properties: ['openDirectory' as const, 'createDirectory' as const],
        ...(current === '' ? {} : { defaultPath: current }),
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      const picked = result.filePaths[0] ?? '';
      return { path: result.canceled ? '' : picked, cancelled: result.canceled };
    },
  );

  handleAsync(IpcChannels.downloadsOpenFolder, async (): Promise<boolean> => {
    const dir = PreferenceStore.getAll().downloadDirectory;
    if (dir === '') return false;
    // `openPath` resolves to a non-empty message on failure — a folder that has been deleted since it
    // was chosen is a click that did nothing, and reports as one.
    return (await shell.openPath(dir)) === '';
  });
}
