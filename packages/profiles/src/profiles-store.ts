import { readJsonFile, writeJsonFile } from '@tepegoz/json-store';
import { emptyProfilesFile, type Profile, type ProfilesFile } from './profiles-model';
import {
  addProfile as addProfilePure,
  removeProfile as removeProfilePure,
  renameProfile as renameProfilePure,
  touchLastUsed as touchLastUsedPure,
  type AddProfileInput,
} from './profiles-registry';
import { ProfilesFileSchema } from './schemas';

/**
 * The shared profile registry (`<root>/profiles.json` — Chrome's `Local State` equivalent).
 * MAIN PROCESS ONLY — imported via the `@tepegoz/profiles/store` subpath, deliberately kept out of the
 * package's pure barrel so a renderer bundle never pulls Node's `fs` in transitively (ADR-0045).
 *
 * **Shared across processes.** Under process-per-profile every running profile has its own Electron
 * instance, and they all read/write this ONE file. `@tepegoz/json-store`'s atomic tmp+rename write
 * rules out a torn file, but a stale in-memory copy could still clobber another process's change on a
 * whole-object write — so every mutation below re-reads from disk first (read-modify-write) and reads
 * go through `getAll()`, which also refreshes. The residual race (two processes mutating within the
 * same few milliseconds) is acceptable for a registry mutated only by explicit, rare user actions.
 */
export default class ProfilesStore {
  private static filePath = '';
  private static file: ProfilesFile = emptyProfilesFile();

  static init(deps: { filePath: string }): void {
    ProfilesStore.filePath = deps.filePath;
    ProfilesStore.reload();
  }

  /** Test seam. */
  static reset(): void {
    ProfilesStore.filePath = '';
    ProfilesStore.file = emptyProfilesFile();
  }

  /** Re-read from disk, picking up writes made by OTHER profiles' processes. */
  private static reload(): ProfilesFile {
    const parsed = ProfilesFileSchema.safeParse(readJsonFile(ProfilesStore.filePath));
    ProfilesStore.file = parsed.success ? parsed.data : emptyProfilesFile();
    return ProfilesStore.file;
  }

  static getAll(): ProfilesFile {
    const file = ProfilesStore.reload();
    return { ...file, profiles: [...file.profiles] };
  }

  static add(input: AddProfileInput): Profile {
    const { file, profile } = addProfilePure(ProfilesStore.reload(), input);
    ProfilesStore.persist(file);
    return profile;
  }

  static rename(id: string, name: string): void {
    ProfilesStore.persist(renameProfilePure(ProfilesStore.reload(), id, name));
  }

  static remove(id: string): void {
    ProfilesStore.persist(removeProfilePure(ProfilesStore.reload(), id));
  }

  static touchLastUsed(id: string): void {
    ProfilesStore.persist(touchLastUsedPure(ProfilesStore.reload(), id));
  }

  private static persist(file: ProfilesFile): void {
    ProfilesStore.file = ProfilesFileSchema.parse(file);
    writeJsonFile(ProfilesStore.filePath, ProfilesStore.file);
  }
}
