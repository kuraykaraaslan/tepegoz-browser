import { describe, expect, it } from 'vitest';

import { profileSpawnCommand } from './profile-launcher';

/**
 * A newly launched profile must be a top-level OS process, never a child in this one's tree — closing
 * or quitting one profile must not take the others down. `profileSpawnCommand` encodes that: on
 * Windows the launch is routed through cmd's `start` (detaches it out of `turbo`'s dev-time job /
 * process tree); elsewhere a plain detached spawn is enough.
 */
describe('profileSpawnCommand', () => {
  const args = ['--user-data-dir=C:\\Users\\a b\\tepegoz\\Profiles\\profile-1', '--profile-id=profile-1'];

  it('routes the Windows launch through `start` so it breaks out of the process tree', () => {
    const { command, args: spawnArgs, shell } = profileSpawnCommand('C:\\app\\electron.exe', args, 'win32');
    expect(shell).toBe(true);
    expect(spawnArgs).toEqual([]);
    expect(command).toBe(
      'start "" /b "C:\\app\\electron.exe" ' +
        '"--user-data-dir=C:\\Users\\a b\\tepegoz\\Profiles\\profile-1" "--profile-id=profile-1"',
    );
  });

  it('every token is quoted so a profile path with spaces survives cmd parsing', () => {
    const { command } = profileSpawnCommand('C:\\app\\electron.exe', args, 'win32');
    expect(command).toContain('"--user-data-dir=C:\\Users\\a b\\tepegoz\\Profiles\\profile-1"');
  });

  it('spawns the exe directly on POSIX (detached is enough there)', () => {
    const { command, args: spawnArgs, shell } = profileSpawnCommand('/opt/tepegoz/electron', args, 'linux');
    expect(shell).toBe(false);
    expect(command).toBe('/opt/tepegoz/electron');
    expect(spawnArgs).toEqual(args);
  });
});
