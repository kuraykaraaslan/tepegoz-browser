import { ipcMain } from 'electron';
import { AppError, Logger, toBoundary } from '@tepegoz/libs';
import {
  encodeBoundaryMessage,
  IpcChannels,
  type IpcChannel,
  type LoginCredentialMeta,
  type LoginImportResult,
} from '@tepegoz/desktop-ipc';
import {
  LoginExportSchema,
  LoginIdSchema,
  LoginImportSchema,
  LoginSetSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { PasswordProviderRegistry } from '@tepegoz/password-core';
import type { IpcMainInvokeEvent } from 'electron';
import { isTrustedAppUrl } from '../lib/trusted-origin';
import { mainStrings } from '../lib/i18n-main';

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!isTrustedAppUrl(url)) {
    Logger.warn('Rejected password IPC from untrusted sender', { url });
    throw new AppError(mainStrings().errors.forbidden, 403);
  }
}

function handle<T>(channel: IpcChannel, fn: (event: IpcMainInvokeEvent, payload: unknown) => T): void {
  ipcMain.handle(channel, (event, payload: unknown): T => {
    try {
      assertTrustedSender(event);
      return fn(event, payload);
    } catch (err) {
      const boundary = toBoundary(err);
      Logger.error(`IPC ${channel} failed`, { statusCode: boundary.statusCode, message: boundary.message });
      throw new Error(encodeBoundaryMessage(boundary.message, boundary.statusCode));
    }
  });
}

function handleAsync<T>(channel: IpcChannel, fn: (event: IpcMainInvokeEvent, payload: unknown) => Promise<T>): void {
  ipcMain.handle(channel, async (event, payload: unknown): Promise<T> => {
    try {
      assertTrustedSender(event);
      return await fn(event, payload);
    } catch (err) {
      const boundary = toBoundary(err);
      Logger.error(`IPC ${channel} failed`, { statusCode: boundary.statusCode, message: boundary.message });
      throw new Error(encodeBoundaryMessage(boundary.message, boundary.statusCode));
    }
  });
}

export default class PasswordHost {
  static attach(): void {
    handleAsync(IpcChannels.loginsList, async (): Promise<LoginCredentialMeta[]> => {
      return PasswordProviderRegistry.list_all();
    });

    handleAsync(IpcChannels.loginsSet, async (_event, payload): Promise<LoginCredentialMeta> => {
      const input = LoginSetSchema.parse(payload);
      const local = PasswordProviderRegistry.get('local');
      if (!local) throw new AppError('Local vault not registered', 500);
      return local.set({
        url: input.url,
        username: input.username,
        password: input.secret,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      });
    });

    handle(IpcChannels.loginsRemove, (_event, payload): void => {
      const id = LoginIdSchema.parse(payload);
      const local = PasswordProviderRegistry.get('local');
      if (!local) throw new AppError('Local vault not registered', 500);
      void local.remove(id);
    });

    handleAsync(IpcChannels.loginsImport, async (_event, payload): Promise<LoginImportResult> => {
      const { data, format } = LoginImportSchema.parse(payload);
      const local = PasswordProviderRegistry.get('local');
      if (!local?.import) throw new AppError('Import not supported', 501);
      return local.import(data, format);
    });

    handleAsync(IpcChannels.loginsExport, async (_event, payload): Promise<string> => {
      const format = LoginExportSchema.parse(payload);
      const local = PasswordProviderRegistry.get('local');
      if (!local?.export) throw new AppError('Export not supported', 501);
      return local.export(format);
    });
  }
}
