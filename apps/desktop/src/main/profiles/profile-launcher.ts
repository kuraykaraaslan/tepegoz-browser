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
 *
 * **The new process must be a top-level process, not a child of this one.** A profile outlives the
 * process that opened it — closing (or quitting) profile A must never take profile B down. On POSIX
 * `detached` gives the child its own session/process-group, so a group signal to this process (e.g.
 * `turbo`'s Ctrl-C during `pnpm dev`) doesn't reach it. On Windows that is not enough: under `pnpm dev`
 * every process here is a descendant of a single `turbo` process wrapped in a job object that kills the
 * whole tree when its first task exits, and tools that "kill the process tree" (VS Code's terminal,
 * `taskkill /T`) walk parent→child. Routing the launch through cmd's `start` makes the new Electron a
 * detached top-level process instead — the transient `cmd` exits immediately, orphaning it out of the
 * tree. (A packaged app launched from Explorer has no such job; this just makes dev behave like it.)
 */
export function launchProfile(profileId: string): void {
  const userDataDir = profileDir(profilesRoot(), profileId);
  // Packaged: argv[0] is our own exe, so re-exec it directly. Dev: argv[0] is electron.exe and the app
  // path must be passed as the first argument, exactly as the dev launcher did for THIS process.
  const appArgs = app.isPackaged
    ? [`--user-data-dir=${userDataDir}`, `--profile-id=${profileId}`]
    : [app.getAppPath(), `--user-data-dir=${userDataDir}`, `--profile-id=${profileId}`];

  // ELECTRON_RUN_AS_NODE turns the child into a plain Node process (no `app`, no windows) and is
  // inherited from our env. Tooling around this repo sets it (`pnpm dev`, the eval runner), so strip it
  // explicitly rather than assuming a clean environment.
  const env = { ...process.env };
  delete env['ELECTRON_RUN_AS_NODE'];

  const { command, args, shell } = profileSpawnCommand(process.execPath, appArgs, process.platform);

  try {
    const child = spawn(command, args, {
      shell,
      detached: true, // survives this profile's process exiting
      stdio: 'ignore',
      windowsHide: true,
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

/**
 * Build the `spawn` invocation for a profile launch. Pure (platform is a parameter) so the Windows
 * `start` detaching is unit-testable without actually spawning.
 *
 * Windows: `cmd /d /s /c start "" /b <exe> <args…>` — `""` is an (empty) window title so the quoted
 * exe path isn't mistaken for one, `/b` suppresses a console window. Every token is quoted so a
 * user profile path with spaces survives. Everything passed here is app-derived, never user input.
 */
export function profileSpawnCommand(
  execPath: string,
  appArgs: readonly string[],
  platform: NodeJS.Platform,
): { command: string; args: string[]; shell: boolean } {
  if (platform === 'win32') {
    const quoted = [execPath, ...appArgs].map((a) => `"${a}"`).join(' ');
    return { command: `start "" /b ${quoted}`, args: [], shell: true };
  }
  return { command: execPath, args: [...appArgs], shell: false };
}
