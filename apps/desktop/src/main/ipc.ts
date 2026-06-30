import { app, BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { AppError, Logger, toBoundary } from '@tepegoz/libs';
import {
  IpcChannels,
  type AppInfo,
  type CredentialsStatus,
  type IpcChannel,
  type Preferences,
} from '../shared/ipc-contract';
import {
  AppInfoSchema,
  RemoveProviderKeyInputSchema,
  SetProviderKeyInputSchema,
} from '../shared/ipc-schemas';
import { PreferencesPatchSchema } from './preferences/preferences.model';
import { isTrustedAppUrl } from './lib/trusted-origin';
import CredentialVault from './security/credential-vault';
import PreferenceStore from './preferences/preference-store';

/** Reject IPC from frames that are not our own app content (exact-host allow-list). */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!isTrustedAppUrl(url)) {
    Logger.warn('Rejected IPC from untrusted sender', { url });
    throw new AppError('Forbidden', 403);
  }
}

/**
 * Single boundary for every handler (ADR-0009): validate sender, run the handler, and map ANY thrown
 * value to { message, statusCode } via toBoundary — logging the full error in main (redacted) and
 * letting ONLY the mapped, clean message cross to the untrusted renderer (raw zod/internal text and
 * the statusCode never leak across the boundary).
 */
function handle<T>(channel: IpcChannel, fn: (event: IpcMainInvokeEvent, payload: unknown) => T): void {
  ipcMain.handle(channel, (event, payload: unknown): T => {
    try {
      assertTrustedSender(event);
      return fn(event, payload);
    } catch (err) {
      const boundary = toBoundary(err);
      Logger.error(`IPC ${channel} failed`, {
        statusCode: boundary.statusCode,
        message: boundary.message,
      });
      throw new Error(boundary.message);
    }
  });
}

function credentialsStatus(): CredentialsStatus {
  return {
    encryptionAvailable: CredentialVault.isEncryptionAvailable(),
    providers: CredentialVault.status(),
  };
}

/** Register all typed IPC handlers. */
export function registerIpc(): void {
  handle(
    IpcChannels.appGetInfo,
    (): AppInfo =>
      AppInfoSchema.parse({
        name: 'Tepegöz',
        version: app.getVersion(),
        platform: process.platform,
      }),
  );

  handle(IpcChannels.prefsGet, (): Preferences => PreferenceStore.getAll());

  handle(IpcChannels.prefsSet, (_event, payload): Preferences => {
    const validated = PreferencesPatchSchema.parse(payload);
    return PreferenceStore.update(validated);
  });

  handle(IpcChannels.credentialsStatus, (): CredentialsStatus => credentialsStatus());

  handle(IpcChannels.credentialsSet, (_event, payload): CredentialsStatus => {
    const { provider, apiKey } = SetProviderKeyInputSchema.parse(payload);
    CredentialVault.setKey(provider, apiKey);
    return credentialsStatus();
  });

  handle(IpcChannels.credentialsRemove, (_event, payload): CredentialsStatus => {
    const { provider } = RemoveProviderKeyInputSchema.parse(payload);
    CredentialVault.removeKey(provider);
    return credentialsStatus();
  });

  // Custom window chrome controls (fire-and-forget): act on the SENDER's window only, and ignore
  // anything from an untrusted frame.
  const onWindowControl = (channel: string, action: (win: BrowserWindow) => void): void => {
    ipcMain.on(channel, (event: IpcMainEvent) => {
      if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) action(win);
    });
  };
  onWindowControl(IpcChannels.windowMinimize, (win) => {
    win.minimize();
  });
  onWindowControl(IpcChannels.windowMaximizeToggle, (win) => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  onWindowControl(IpcChannels.windowClose, (win) => {
    win.close();
  });

  handle(IpcChannels.windowIsMaximized, (event): boolean => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });
}
