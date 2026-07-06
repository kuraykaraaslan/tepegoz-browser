import type { UploadCommandInput, UploadCreateInput, UploadRecord } from '@tepegoz/uploads';
import type { UploadToolsHost } from '@tepegoz/uploads/tools';
import UploadService from './upload-service.electron';
import TabManager from '../tabs';

export const uploadToolsHost: UploadToolsHost = {
  listUploads: () => UploadService.list(),
  getUpload: (id: string): UploadRecord | null =>
    UploadService.list().find((record) => record.id === id) ?? null,
  createUpload: (input: UploadCreateInput) =>
    UploadService.create(
      { ...input, actor: 'agent' },
      input.tabId !== undefined ? TabManager.webContentsForTab(input.tabId) : TabManager.activeWebContents(),
    ),
  commandUpload: async (input: UploadCommandInput) => {
    await UploadService.command(input.id, input.action);
    return { ok: true };
  },
};
