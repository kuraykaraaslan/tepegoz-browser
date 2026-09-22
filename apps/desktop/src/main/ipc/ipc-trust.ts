import { IpcChannels } from '@tepegoz/desktop-ipc';
import {
  TrustDomainSchema,
  TrustProfileSetSchema,
  TrustProfilesImportJsonSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { AppError } from '@tepegoz/libs';
import { parseTrustProfilesImport } from '@tepegoz/persistence';
import type { TrustProfile, TrustProfilesImportResult } from '@tepegoz/shared-types';
import {
  exportTrustProfilesJson,
  importTrustProfiles,
  listTrustProfiles,
  removeTrustProfile,
  setTrustProfile,
} from '../security/trust-profile-host.electron';
import { handle, parsePayload } from './ipc-helpers';

/**
 * Scoped Trust Profiles over IPC.
 *
 * Five handlers, and none of them decides anything: the renderer says which site and which of three
 * levels, main stores it, and the Policy Kernel decides what that level is allowed to change. The
 * renderer cannot express "allow this" — only "I trust this site", which `applyTrust` may narrow to
 * nothing at all (on a bank, or for a destructive action, it does). Export/import are the same shape,
 * only in bulk: import validates the untrusted file entry-by-entry and applies each one through the
 * exact same `setTrustProfile` the `trust-profiles:set` handler above already calls, so nothing here
 * grants a level a manual change could not also have granted.
 */
export function registerTrustIpc(): void {
  handle(IpcChannels.trustProfilesList, (): TrustProfile[] => listTrustProfiles());

  handle(IpcChannels.trustProfilesSet, (_event, payload): TrustProfile[] => {
    const input = parsePayload(TrustProfileSetSchema, payload);
    return setTrustProfile(input.domain, input.level);
  });

  handle(IpcChannels.trustProfilesRemove, (_event, payload): TrustProfile[] => {
    const domain = parsePayload(TrustDomainSchema, payload);
    return removeTrustProfile(domain);
  });

  handle(IpcChannels.trustProfilesExport, (): string => {
    // No sync metadata, no tombstoned rows — main only stringifies the reusable domain+level pairs;
    // the untrusted renderer does the Blob download, same split as tasks/macros export.
    return exportTrustProfilesJson();
  });

  handle(IpcChannels.trustProfilesImport, (_event, payload): TrustProfilesImportResult => {
    const json = parsePayload(TrustProfilesImportJsonSchema, payload);
    let split: ReturnType<typeof parseTrustProfilesImport>;
    try {
      split = parseTrustProfilesImport(json);
    } catch {
      // Not JSON, or JSON with no profiles list — a malformed file is a bad request, mapped to the
      // same generic localized 400 as any other rejected renderer payload.
      throw new AppError('Trust profiles import is not a valid export file', 400, 'badRequest');
    }
    return { imported: importTrustProfiles(split.profiles), skipped: split.skipped };
  });
}
