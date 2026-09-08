import type { CreateProfileInput, Profile, RenameProfileInput } from './contract-profiles';

/**
 * Chrome-style multi-profile identities over the bridge (ADR-0045).
 *
 * Process-per-profile: `getActiveProfile` is THIS process's own profile (every window in a process is
 * the same one), and `switchProfile` / a `createProfile`-then-switch is a process spawn — the running
 * target's single-instance lock focuses its window if it is already open. The renderer never names a
 * directory or a partition; only a `default | profile-N` id validated at the boundary.
 */
export interface ProfilesApi {
  listProfiles(): Promise<Profile[]>;
  getActiveProfile(): Promise<Profile | null>;
  /** Create a profile (auto-named "Profile N" unless `name` is given) and return it. */
  createProfile(input?: CreateProfileInput): Promise<Profile>;
  renameProfile(input: RenameProfileInput): Promise<void>;
  /** Delete a profile and its data directory. Refused for the last profile or the one in use. */
  deleteProfile(id: string): Promise<void>;
  /** Open (or focus) a profile's window — a process spawn, so the promise resolves once it is
   *  launched, not once its window is up. Rejects for an unknown id. */
  switchProfile(id: string): Promise<void>;
}
