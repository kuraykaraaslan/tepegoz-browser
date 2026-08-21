import { AppError } from '@tepegoz/libs';
import {
  IpcChannels,
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
import { handleAsync, parsePayload } from '../ipc/ipc-helpers';
import { mainStrings } from '../lib/i18n-main';

/**
 * Login-vault IPC. The sender allow-list, the AppError→boundary mapping and the payload validation all
 * come from the ONE `ipc-helpers` boundary — this file used to carry byte-identical private copies of
 * `assertTrustedSender`/`handle`/`handleAsync`, which meant a fix to the trust check had to be made in
 * three places to actually hold. There is one copy now.
 *
 * Every handler is async so the boundary awaits the provider: a rejected write must reach the renderer
 * as a failure, not be dropped by a fire-and-forget `void`.
 */

/** The local vault, or a 503 — a missing provider is an environment fault, not a renderer fault. */
function localProvider() {
  const local = PasswordProviderRegistry.get('local');
  if (!local) throw new AppError(mainStrings().errors.upstreamDown, 503);
  return local;
}

export default class PasswordHost {
  static attach(): void {
    handleAsync(IpcChannels.loginsList, async (): Promise<LoginCredentialMeta[]> => {
      return PasswordProviderRegistry.list_all();
    });

    handleAsync(IpcChannels.loginsSet, async (_event, payload): Promise<LoginCredentialMeta> => {
      const input = parsePayload(LoginSetSchema, payload);
      return localProvider().set({
        url: input.url,
        username: input.username,
        password: input.secret,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      });
    });

    // Awaited on purpose: `void local.remove(id)` reported success to the renderer even when the
    // delete failed, and lost the error to an unhandled rejection. A password the user deleted must
    // either be gone or the UI must say it isn't.
    handleAsync(IpcChannels.loginsRemove, async (_event, payload): Promise<void> => {
      const id = parsePayload(LoginIdSchema, payload);
      await localProvider().remove(id);
    });

    handleAsync(IpcChannels.loginsImport, async (_event, payload): Promise<LoginImportResult> => {
      const { data, format } = parsePayload(LoginImportSchema, payload);
      const local = localProvider();
      if (!local.import) throw new AppError(mainStrings().errors.badState, 501);
      return local.import(data, format);
    });

    handleAsync(IpcChannels.loginsExport, async (_event, payload): Promise<string> => {
      const format = parsePayload(LoginExportSchema, payload);
      const local = localProvider();
      if (!local.export) throw new AppError(mainStrings().errors.badState, 501);
      return local.export(format);
    });
  }
}
