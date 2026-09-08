import { join } from 'node:path';
import { app } from 'electron';

/**
 * Profile directory layout (ADR-0045), **process-per-profile**: each profile runs as its own Electron
 * instance launched with `--user-data-dir=<root>/Profiles/<id>`, so inside a running process
 * `app.getPath('userData')` already IS that profile's directory — its SQLite DB, preferences,
 * credential vault, and Chromium's own `Partitions/` / `Cache/` all land inside it with no per-file
 * path plumbing.
 *
 * The helpers here are therefore only about the SHARED ROOT — the launcher, the cross-profile
 * registry, and the migration / deletion paths, which must reason about profiles other than the
 * running one.
 */

/** The shared root that holds `profiles.json` + every `Profiles/<id>/` directory (`%APPDATA%/tepegoz`).
 *  Derived from `appData`, NOT `userData` — inside a profile process the latter is already the profile
 *  directory, one level deeper. The literal `tepegoz` (not `app.getName()`, which is the display name
 *  "Tepegöz") matches the pre-multi-profile single-directory choice. */
export function profilesRoot(): string {
  return join(app.getPath('appData'), 'tepegoz');
}

/** One profile's data directory — the `--user-data-dir` its process is launched with. */
export function profileDir(root: string, profileId: string): string {
  return join(root, 'Profiles', profileId);
}

/** The cross-profile registry (Chrome's `Local State` equivalent). Lives at the root, outside any one
 *  profile, because every profile's process reads / writes it and the launcher must read it before a
 *  profile is chosen. Concurrently accessed by all running profile processes — see `ProfilesStore`,
 *  which re-reads before every mutation so a write from one process can't clobber another's. */
export function profilesJsonPath(root: string): string {
  return join(root, 'profiles.json');
}
