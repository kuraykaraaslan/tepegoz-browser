/**
 * Domain model for Chrome-style multi-profile identities (ADR-0045). `Profile.id` follows Chrome's own
 * scheme — `default` for the first (or migrated) profile, then `profile-1`, `profile-2`, … sequential
 * for new ones — and is immutable once assigned; the user-facing `name` is independently editable,
 * exactly like Chrome's folder name never changing after a rename.
 */

/** Reserved id for the first / migrated profile — matches Chrome's "Default" folder. */
export const DEFAULT_PROFILE_ID = 'default';

/** Size of the fixed avatar-color palette new profiles are auto-assigned from (Chrome-style). */
export const PROFILE_COLOR_COUNT = 8;

export interface Profile {
  id: string;
  name: string;
  colorId: number;
  avatarInitial?: string | undefined;
  createdAt: number;
  lastUsedAt: number;
}

export interface ProfilesFile {
  version: 1;
  profiles: Profile[];
  /** The first/migrated profile's id — stable, never reassigned even if deleted-and-recreated. */
  defaultProfileId: string;
  /** Which profile to auto-open at cold start (the most recently active one). */
  lastActiveProfileId: string;
}

export function emptyProfilesFile(): ProfilesFile {
  return {
    version: 1,
    profiles: [],
    defaultProfileId: DEFAULT_PROFILE_ID,
    lastActiveProfileId: DEFAULT_PROFILE_ID,
  };
}
