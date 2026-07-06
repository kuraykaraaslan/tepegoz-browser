import { ipcMain, BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { AppError, Logger, toBoundary } from '@tepegoz/libs';
import { encodeBoundaryMessage, type IpcChannel } from '@tepegoz/desktop-ipc';
import { isTrustedAppUrl } from '../lib/trusted-origin';
import { mainStrings } from '../lib/i18n-main';

/**
 * Shared low-level IPC wiring helpers, used by every `ipc-*.ts` domain file (split out of `ipc.ts`,
 * ADR-0010 250-line cap). None of these close over any `registerIpc`-local state — they only take
 * `channel`/`schema`/`fn` as parameters, so hoisting them here is a pure relocation.
 */

/** Reject IPC from frames that are not our own app content (exact-host allow-list). */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!isTrustedAppUrl(url)) {
    Logger.warn('Rejected IPC from untrusted sender', { url });
    throw new AppError(mainStrings().errors.forbidden, 403);
  }
}

/**
 * Single boundary for every handler (ADR-0009): validate sender, run the handler, and map ANY thrown
 * value to { message, statusCode } via toBoundary — logging the full error in main (redacted) and
 * letting ONLY the mapped, clean pair cross to the untrusted renderer (raw zod/internal text never
 * leaks). The pair travels encoded in the Error message (Electron drops custom fields) and the
 * preload decodes it back into a typed IpcBoundaryError for the renderer.
 */
export function handle<T>(
  channel: IpcChannel,
  fn: (event: IpcMainInvokeEvent, payload: unknown) => T,
): void {
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
      throw new Error(encodeBoundaryMessage(boundary.message, boundary.statusCode));
    }
  });
}

/** Async variant of {@link handle}: awaits the handler so a rejected promise is mapped at the
 *  boundary too (the sync `handle` would let an async rejection escape unmapped). */
export function handleAsync<T>(
  channel: IpcChannel,
  fn: (event: IpcMainInvokeEvent, payload: unknown) => Promise<T>,
): void {
  ipcMain.handle(channel, async (event, payload: unknown): Promise<T> => {
    try {
      assertTrustedSender(event);
      return await fn(event, payload);
    } catch (err) {
      const boundary = toBoundary(err);
      Logger.error(`IPC ${channel} failed`, {
        statusCode: boundary.statusCode,
        message: boundary.message,
      });
      throw new Error(encodeBoundaryMessage(boundary.message, boundary.statusCode));
    }
  });
}

/** Browser tabs (fire-and-forget). Validate sender + payload; ignore anything untrusted/malformed. */
export function onAction<T>(channel: string, schema: z.ZodType<T>, fn: (value: T) => void): void {
  ipcMain.on(channel, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = schema.safeParse(payload);
    if (parsed.success) fn(parsed.data);
    else Logger.warn(`Ignored ${channel}: invalid payload`);
  });
}

export function onSignal(channel: string, fn: () => void): void {
  ipcMain.on(channel, (event: IpcMainEvent) => {
    if (isTrustedAppUrl(event.senderFrame?.url ?? '')) fn();
  });
}

/** Custom window chrome controls (fire-and-forget): act on the SENDER's window only, and ignore
 *  anything from an untrusted frame. */
export function onWindowControl(channel: string, action: (win: BrowserWindow) => void): void {
  ipcMain.on(channel, (event: IpcMainEvent) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) action(win);
  });
}
