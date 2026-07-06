import { ipcRenderer } from 'electron';
import { decodeBoundaryError, type IpcChannel } from '@tepegoz/desktop-ipc';

/** Every request/response call goes through here so a rejection reaches the renderer as the typed
 *  `{ message, statusCode }` pair (IpcBoundaryError) the boundary encoded — ADR-0009. Shared by every
 *  `api-*.ts` slice of the preload bridge (ADR-0010 250-line cap split of the former single `index.ts`). */
export async function invoke<T>(channel: IpcChannel, payload?: unknown): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, payload)) as T;
  } catch (err) {
    throw decodeBoundaryError(err);
  }
}
