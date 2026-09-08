import {
  IpcChannels,
  type CreateProfileInput,
  type Profile,
  type RenameProfileInput,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/** Chrome-style multi-profile bridge methods (ADR-0045). No local state — every call is answered by
 *  main against the shared `profiles.json`. */
export const profilesApi: Pick<
  TepegozApi,
  | 'listProfiles'
  | 'getActiveProfile'
  | 'createProfile'
  | 'renameProfile'
  | 'deleteProfile'
  | 'switchProfile'
> = {
  listProfiles: () => invoke<Profile[]>(IpcChannels.profilesList),
  getActiveProfile: () => invoke<Profile | null>(IpcChannels.profilesGetActive),
  createProfile: (input?: CreateProfileInput) =>
    invoke<Profile>(IpcChannels.profilesCreate, input ?? {}),
  renameProfile: (input: RenameProfileInput) => invoke<void>(IpcChannels.profilesRename, input),
  deleteProfile: (id: string) => invoke<void>(IpcChannels.profilesDelete, id),
  switchProfile: (id: string) => invoke<void>(IpcChannels.profilesSwitch, id),
};
