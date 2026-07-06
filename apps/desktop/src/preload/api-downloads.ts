import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type DownloadCommandInput,
  type DownloadRecord,
  type DownloadsState,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/** Browser-download bridge methods. The renderer sees redacted records only; open/reveal/release are
 *  id-addressed commands executed in main. */
export const downloadsApi: Pick<
  TepegozApi,
  'listDownloads' | 'commandDownload' | 'onDownloadsState'
> = {
  listDownloads: () => invoke<DownloadRecord[]>(IpcChannels.downloadsList),
  commandDownload: (input: DownloadCommandInput) =>
    invoke<void>(IpcChannels.downloadsCommand, input),
  onDownloadsState: (callback: (state: DownloadsState) => void) => {
    const listener = (_event: unknown, state: DownloadsState): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.downloadsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.downloadsState, listener);
    };
  },
};
