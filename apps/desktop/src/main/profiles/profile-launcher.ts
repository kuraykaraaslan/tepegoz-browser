import { spawn } from 'node:child_process';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import { profileDir, profilesRoot } from './profile-paths';

/**
 * Launch a profile as its OWN Electron process (ADR-0045, process-per-profile).
 *
 * Isolation comes from `--user-data-dir`: the child's `app.getPath('userData')` becomes that profile's
 * directory, so its preferences, credential vault, SQLite DB and Chromium partitions are a different
 * tree entirely — no in-process routing to get wrong. `--profile-id` rides along so the child names
 * itself in logs and the registry without re-deriving it from the path.
 *
 * **An already-running profile costs nothing extra.** Electron's single-instance lock is keyed by the
 * user-data directory, so re-launching a profile that is already open fails ITS lock; that existing
 * process's `second-instance` handler focuses its window and the new process exits immediately. So
 * "switch to profile X" is the same call whether or not X is running.
 */
export function launchProfile(profileId: string): void {
  const userDataDir = profileDir(profilesRoot(), profileId);
  // Packaged: argv[0] is our own exe, so re-exec it directly. Dev: argv[0] is electron.exe and the app
  // path must be passed as the first argument, exactly as the dev launcher did for THIS process.
  const args = app.isPackaged
    ? [`--user-data-dir=${userDataDir}`, `--profile-id=${profileId}`]
    : [app.getAppPath(), `--user-data-dir=${userDataDir}`, `--profile-id=${profileId}`];

  // ELECTRON_RUN_AS_NODE turns the child into a plain Node process (no `app`, no windows) and is
  // inherited from our env. Tooling around this repo sets it (`pnpm dev`, the eval runner), so strip it
  // explicitly rather than assuming a clean environment.
  const env = { ...process.env };
  delete env['ELECTRON_RUN_AS_NODE'];

  try {
    const child = spawn(process.execPath, args, {
      detached: true, // survives this profile's process exiting
      stdio: 'ignore',
      env,
    });
    child.on('error', (err) => {
      Logger.error('Failed to launch profile process', { profileId, err: String(err) });
    });
    child.unref();
    Logger.info('Launched profile process', { profileId, userDataDir });
  } catch (err) {
    Logger.error('Failed to launch profile process', { profileId, err: String(err) });
  }
}
