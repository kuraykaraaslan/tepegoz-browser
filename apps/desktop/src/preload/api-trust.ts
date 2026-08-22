import { IpcChannels, type TepegozApi } from '@tepegoz/desktop-ipc';
import type { TrustLevel, TrustProfile } from '@tepegoz/shared-types';
import { invoke } from './ipc-invoke';

/** Scoped Trust Profiles: three read/write calls, no local state. Every level is interpreted in main. */
export const trustApi: Pick<
  TepegozApi,
  'listTrustProfiles' | 'setTrustProfile' | 'removeTrustProfile'
> = {
  listTrustProfiles: () => invoke<TrustProfile[]>(IpcChannels.trustProfilesList),
  setTrustProfile: (domain: string, level: TrustLevel) =>
    invoke<TrustProfile[]>(IpcChannels.trustProfilesSet, { domain, level }),
  removeTrustProfile: (domain: string) =>
    invoke<TrustProfile[]>(IpcChannels.trustProfilesRemove, domain),
};
