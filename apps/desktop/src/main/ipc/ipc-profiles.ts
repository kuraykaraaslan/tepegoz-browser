import { rmSync } from 'node:fs';
import { AppError } from '@tepegoz/libs';
import { IpcChannels, type Profile } from '@tepegoz/desktop-ipc';
import {
  CreateProfileInputSchema,
  ProfileIdSchema,
  RenameProfileInputSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { nextUnusedColorId } from '@tepegoz/profiles';
import ProfilesStore from '@tepegoz/profiles/store';
import { activeProfileId } from '../profiles/profile-boot';
import { launchProfile } from '../profiles/profile-launcher';
import { profileDir, profilesRoot } from '../profiles/profile-paths';
import { handle, parsePayload } from './ipc-helpers';

/**
 * Chrome-style multi-profile IPC (ADR-0045, process-per-profile). Every profile runs in its own
 * Electron process, so "open" / "switch" is a spawn (`profile-launcher.ts`) rather than anything this
 * process does to its own windows, and `profiles.json` is the one piece of shared state —
 * `ProfilesStore` re-reads it before every mutation so concurrent profile processes don't clobber
 * each other.
 */
export function registerProfilesIpc(): void {
  handle(IpcChannels.profilesList, (): Profile[] => ProfilesStore.getAll().profiles);

  handle(IpcChannels.profilesGetActive, (): Profile | null => {
    const id = activeProfileId();
    return ProfilesStore.getAll().profiles.find((p) => p.id === id) ?? null;
  });

  handle(IpcChannels.profilesCreate, (_event, payload): Profile => {
    const input = parsePayload(CreateProfileInputSchema, payload);
    const registry = ProfilesStore.getAll();
    // Chrome-style: a new profile is immediately usable under an auto name, renamed later via
    // `tepegoz://profiles` — no blocking name-entry dialog.
    const name = input.name?.trim() || `Profile ${registry.profiles.length + 1}`;
    return ProfilesStore.add({ name, colorId: input.colorId ?? nextUnusedColorId(registry) });
  });

  handle(IpcChannels.profilesRename, (_event, payload): void => {
    const input = parsePayload(RenameProfileInputSchema, payload);
    if (!ProfilesStore.getAll().profiles.some((p) => p.id === input.id)) {
      throw new AppError('Profile not found', 404);
    }
    ProfilesStore.rename(input.id, input.name);
  });

  handle(IpcChannels.profilesDelete, (_event, payload): void => {
    const id = parsePayload(ProfileIdSchema, payload);
    const registry = ProfilesStore.getAll();
    if (registry.profiles.length <= 1) {
      throw new AppError('Cannot delete the last remaining profile', 400);
    }
    if (!registry.profiles.some((p) => p.id === id)) {
      throw new AppError('Profile not found', 404);
    }
    // A profile owns its own process; this one can't tear another's down, and deleting the directory
    // out from under a live process would corrupt it. Deleting the profile you are USING is likewise
    // refused — switch to another profile and delete it from there.
    if (id === activeProfileId()) {
      throw new AppError('Switch to another profile first, then delete this one', 409);
    }

    // Everything the profile owns lives under its one directory (Chromium's Partitions/ nested inside
    // it under process-per-profile), so a single recursive remove is the whole deletion. If that
    // profile is currently running, its open SQLite / cache handles keep the files locked and this
    // throws — surfaced as an actionable message rather than a partial wipe.
    try {
      rmSync(profileDir(profilesRoot(), id), { recursive: true, force: true });
    } catch {
      throw new AppError('That profile appears to be open — close its window and try again', 409);
    }
    ProfilesStore.remove(id);
  });

  handle(IpcChannels.profilesSwitch, (_event, payload): void => {
    const id = parsePayload(ProfileIdSchema, payload);
    if (!ProfilesStore.getAll().profiles.some((p) => p.id === id)) {
      throw new AppError('Profile not found', 404);
    }
    // Launch it. If that profile is already running, its own single-instance lock rejects the new
    // process and the running one focuses its window instead (see profile-launcher.ts).
    launchProfile(id);
  });
}
