import { IpcChannels, type TepegozApi } from '@tepegoz/desktop-ipc';
import type { TrustLevel, TrustProfile, TrustProfilesImportResult } from '@tepegoz/shared-types';
import { invoke } from './ipc-invoke';

/** Scoped Trust Profiles: read/write calls plus export/import, no local state. Every level is
 *  interpreted in main. */
export const trustApi: Pick<
  TepegozApi,
  | 'listTrustProfiles'
  | 'setTrustProfile'
  | 'removeTrustProfile'
  | 'exportTrustProfiles'
  | 'importTrustProfiles'
> = {
  listTrustProfiles: () => invoke<TrustProfile[]>(IpcChannels.trustProfilesList),
  setTrustProfile: (domain: string, level: TrustLevel) =>
    invoke<TrustProfile[]>(IpcChannels.trustProfilesSet, { domain, level }),
  removeTrustProfile: (domain: string) =>
    invoke<TrustProfile[]>(IpcChannels.trustProfilesRemove, domain),
  exportTrustProfiles: () => invoke<string>(IpcChannels.trustProfilesExport),
  importTrustProfiles: (json: string) =>
    invoke<TrustProfilesImportResult>(IpcChannels.trustProfilesImport, json),
};
