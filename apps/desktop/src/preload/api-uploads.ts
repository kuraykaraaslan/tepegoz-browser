import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type TepegozApi,
  type UploadCommandInput,
  type UploadRecord,
  type UploadsState,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/** Browser-upload bridge methods. The renderer sees redacted records only; local paths stay in main. */
export const uploadsApi: Pick<TepegozApi, 'listUploads' | 'commandUpload' | 'onUploadsState'> = {
  listUploads: () => invoke<UploadRecord[]>(IpcChannels.uploadsList),
  commandUpload: (input: UploadCommandInput) => invoke<void>(IpcChannels.uploadsCommand, input),
  onUploadsState: (callback: (state: UploadsState) => void) => {
    const listener = (_event: unknown, state: UploadsState): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.uploadsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.uploadsState, listener);
    };
  },
};
