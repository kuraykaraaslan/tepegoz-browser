import { IpcChannels, type UploadRecord } from '@tepegoz/desktop-ipc';
import { UploadCommandInputSchema } from '@tepegoz/desktop-ipc/schemas';
import UploadService from '../uploads/upload-service.electron';
import { handle, handleAsync } from './ipc-helpers';

export function registerUploadsIpc(): void {
  handle(IpcChannels.uploadsList, (): UploadRecord[] => UploadService.list());
  handleAsync(IpcChannels.uploadsCommand, async (_event, payload): Promise<void> => {
    const { id, action } = UploadCommandInputSchema.parse(payload);
    await UploadService.command(id, action);
  });
}
