import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `profile-boot.ts` — resolves WHICH profile a process is and pins `userData`. The three selection
 * paths (`--profile-id`, a bare `--user-data-dir` opt-out, a plain launch) and the "opt-out must not
 * write the shared registry" guard are what matter.
 */

let root: string;
const switches: Record<string, string> = {};
const setPath = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: (k: string) => (k === 'appData' ? root : root),
    setPath,
    commandLine: { getSwitchValue: (k: string) => switches[k] ?? '' },
  },
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { resolveAndPinProfile, activeProfileId } = await import('./profile-boot');
const { profilesJsonPath, profilesRoot } = await import('./profile-paths');

/** `profilesRoot()` = `<appData>/tepegoz`; the mock returns `root` for `appData`. */
let pRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tepegoz-boot-'));
  pRoot = profilesRoot();
  for (const k of Object.keys(switches)) delete switches[k];
  setPath.mockClear();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('resolveAndPinProfile', () => {
  it('a plain launch migrates, creates the default profile, and pins its directory', () => {
    const id = resolveAndPinProfile();
    expect(id).toBe('default');
    expect(activeProfileId()).toBe('default');
    expect(setPath).toHaveBeenCalledWith('userData', join(pRoot, 'Profiles', 'default'));
    expect(existsSync(profilesJsonPath(pRoot))).toBe(true);
  });

  it('a launcher child (`--profile-id`) pins that profile without re-migrating', () => {
    switches['profile-id'] = 'profile-1';
    const id = resolveAndPinProfile();
    expect(id).toBe('profile-1');
    expect(setPath).toHaveBeenCalledWith('userData', join(pRoot, 'Profiles', 'profile-1'));
  });

  it('a bare `--user-data-dir` is honoured verbatim and does NOT touch the shared registry', () => {
    const iso = join(root, 'isolated-run');
    switches['user-data-dir'] = iso;
    const id = resolveAndPinProfile();
    expect(id).toBe('default');
    expect(setPath).toHaveBeenCalledWith('userData', iso);
    // The opt-out guard: no profiles.json written into the real appData root.
    expect(existsSync(profilesJsonPath(pRoot))).toBe(false);
  });

  it('records the booted profile as last-active for the next plain relaunch', () => {
    resolveAndPinProfile();
    const registry = JSON.parse(readFileSync(profilesJsonPath(pRoot), 'utf8')) as {
      lastActiveProfileId: string;
    };
    expect(registry.lastActiveProfileId).toBe('default');
  });
});
