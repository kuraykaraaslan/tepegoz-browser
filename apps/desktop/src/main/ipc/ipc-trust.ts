import { IpcChannels } from '@tepegoz/desktop-ipc';
import { TrustDomainSchema, TrustProfileSetSchema } from '@tepegoz/desktop-ipc/schemas';
import type { TrustProfile } from '@tepegoz/shared-types';
import {
  listTrustProfiles,
  removeTrustProfile,
  setTrustProfile,
} from '../security/trust-profile-host.electron';
import { handle, parsePayload } from './ipc-helpers';

/**
 * Scoped Trust Profiles over IPC.
 *
 * Three handlers, and none of them decides anything: the renderer says which site and which of three
 * levels, main stores it, and the Policy Kernel decides what that level is allowed to change. The
 * renderer cannot express "allow this" — only "I trust this site", which `applyTrust` may narrow to
 * nothing at all (on a bank, or for a destructive action, it does).
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
}
