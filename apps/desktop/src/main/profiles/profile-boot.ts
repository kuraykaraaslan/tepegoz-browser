import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import { DEFAULT_PROFILE_ID } from '@tepegoz/profiles';
import ProfilesStore from '@tepegoz/profiles/store';
import { migrateLegacyProfile } from './migrate-legacy-profile';
import { profileDir, profilesJsonPath, profilesRoot } from './profile-paths';

/**
 * One-time carry-over from the pre-rename `%APPDATA%/Tepegöz` folder into the `tepegoz` root, so an
 * install predating the rename keeps its settings + encrypted API keys. Writes into the ROOT (older
 * than both the rename and the profile split); `migrateLegacyProfile` then relocates the root's flat
 * layout into `Profiles/default/`.
 */
function carryOverPreRenameFiles(root: string): void {
  const legacyDir = join(app.getPath('appData'), 'Tepegöz');
  if (!existsSync(legacyDir)) return;
  mkdirSync(root, { recursive: true });
  for (const file of ['preferences.json', 'credentials.enc.json']) {
    const src = join(legacyDir, file);
    const dst = join(root, file);
    if (existsSync(src) && !existsSync(dst)) {
      try {
        copyFileSync(src, dst);
      } catch (err) {
        Logger.warn('Failed to carry over legacy user-data file', { file, err: String(err) });
      }
    }
  }
}

/**
 * Resolves WHICH profile this process is, and pins `userData` to that profile's directory — the single
 * step that makes process-per-profile work (ADR-0045). Must run at module load, BEFORE
 * `app.requestSingleInstanceLock()` (whose lock is keyed by the user-data dir, giving one instance per
 * profile for free) and before `whenReady`, so every later `app.getPath('userData')` — the stores, the
 * SQLite DB, Chromium's own partitions — already resolves inside the profile.
 *
 * Selection order:
 *  1. `--profile-id=<id>` — a child launched by `profile-launcher.ts`. Its `--user-data-dir` is
 *     already applied by Chromium; this records the identity and pins the path explicitly so it is
 *     byte-identical to what the launcher computed.
 *  2. `--user-data-dir=<path>` with no `--profile-id` — an explicit override (the AI-1 eval harness
 *     isolates a run this way). Honored verbatim; the profile is named `default`.
 *  3. Neither — a plain launch: carry over any pre-rename files, run the one-time legacy migration,
 *     then open whichever profile the registry names as last-active (ADR-0045's cold-start rule),
 *     falling back to `default`.
 */
export function resolveAndPinProfile(): string {
  const root = profilesRoot();
  const explicitId = app.commandLine.getSwitchValue('profile-id');
  const explicitUserDataDir = app.commandLine.getSwitchValue('user-data-dir');

  if (explicitId.length > 0) {
    const dir = explicitUserDataDir.length > 0 ? explicitUserDataDir : profileDir(root, explicitId);
    mkdirSync(dir, { recursive: true });
    app.setPath('userData', dir);
    return explicitId;
  }

  if (explicitUserDataDir.length > 0) {
    mkdirSync(explicitUserDataDir, { recursive: true });
    app.setPath('userData', explicitUserDataDir);
    return DEFAULT_PROFILE_ID;
  }

  carryOverPreRenameFiles(root);
  migrateLegacyProfile(root);

  let profileId = DEFAULT_PROFILE_ID;
  try {
    ProfilesStore.init({ filePath: profilesJsonPath(root) });
    const registry = ProfilesStore.getAll();
    const lastActive = registry.profiles.find((p) => p.id === registry.lastActiveProfileId);
    profileId = lastActive?.id ?? registry.profiles[0]?.id ?? DEFAULT_PROFILE_ID;
  } catch (err) {
    Logger.warn('Could not read the profile registry — booting the default profile', {
      err: String(err),
    });
  }

  const dir = profileDir(root, profileId);
  mkdirSync(dir, { recursive: true });
  app.setPath('userData', dir);

  // Record this profile as last-active so a plain (no-switch) relaunch reopens it — ADR-0045 §8.
  // Best-effort: a missing / corrupt registry must never block startup.
  try {
    ProfilesStore.touchLastUsed(profileId);
  } catch {
    /* registry unavailable — the profile still runs off its own directory */
  }

  return profileId;
}
