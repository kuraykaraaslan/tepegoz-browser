import { DEFAULT_PROFILE_ID, PROFILE_COLOR_COUNT, type Profile, type ProfilesFile } from './profiles-model';

/** Pure reducers over `ProfilesFile` — no I/O (mirrors `@tepegoz/downloads`'s reducer style). The
 *  Electron-facing `ProfilesStore` (this package's `./store` subpath) wraps these with persistence. */

/** The next id to assign: `default` for the very first profile (matches Chrome's "Default" folder),
 *  then the lowest unused `profile-N` — stays stable even after profiles are deleted out of order. */
export function nextProfileId(file: ProfilesFile): string {
  if (file.profiles.length === 0) return DEFAULT_PROFILE_ID;
  const used = new Set(file.profiles.map((p) => p.id));
  let n = 1;
  while (used.has(`profile-${n}`)) n++;
  return `profile-${n}`;
}

/** The next unused color slot from the fixed palette (Chrome-style), wrapping if every slot is taken. */
export function nextUnusedColorId(file: ProfilesFile): number {
  const used = new Set(file.profiles.map((p) => p.colorId));
  for (let i = 0; i < PROFILE_COLOR_COUNT; i++) {
    if (!used.has(i)) return i;
  }
  return file.profiles.length % PROFILE_COLOR_COUNT;
}

export interface AddProfileInput {
  name: string;
  colorId: number;
  avatarInitial?: string | undefined;
}

export function addProfile(
  file: ProfilesFile,
  input: AddProfileInput,
): { file: ProfilesFile; profile: Profile } {
  const now = Date.now();
  const profile: Profile = {
    id: nextProfileId(file),
    name: input.name,
    colorId: input.colorId,
    avatarInitial: input.avatarInitial,
    createdAt: now,
    lastUsedAt: now,
  };
  const profiles = [...file.profiles, profile];
  const defaultProfileId = file.profiles.length === 0 ? profile.id : file.defaultProfileId;
  return { file: { ...file, profiles, defaultProfileId }, profile };
}

/** Only touches the display name — the id (and its on-disk `Profiles/<id>/` folder) never changes. */
export function renameProfile(file: ProfilesFile, id: string, name: string): ProfilesFile {
  return { ...file, profiles: file.profiles.map((p) => (p.id === id ? { ...p, name } : p)) };
}

export function removeProfile(file: ProfilesFile, id: string): ProfilesFile {
  const profiles = file.profiles.filter((p) => p.id !== id);
  const lastActiveProfileId =
    file.lastActiveProfileId === id
      ? (profiles[0]?.id ?? file.defaultProfileId)
      : file.lastActiveProfileId;
  return { ...file, profiles, lastActiveProfileId };
}

export function touchLastUsed(file: ProfilesFile, id: string): ProfilesFile {
  const now = Date.now();
  return {
    ...file,
    lastActiveProfileId: id,
    profiles: file.profiles.map((p) => (p.id === id ? { ...p, lastUsedAt: now } : p)),
  };
}

export function findProfile(file: ProfilesFile, id: string): Profile | undefined {
  return file.profiles.find((p) => p.id === id);
}
