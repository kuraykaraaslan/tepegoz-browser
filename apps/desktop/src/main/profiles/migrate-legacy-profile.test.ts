import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ProfilesStore from '@tepegoz/profiles/store';
import { migrateLegacyProfile } from './migrate-legacy-profile';
import { profileDir, profilesJsonPath } from './profile-paths';

/** The shared root (`%APPDATA%/tepegoz` in production) — holds `profiles.json` + every profile dir. */
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tepegoz-migrate-'));
  ProfilesStore.reset();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('migrateLegacyProfile', () => {
  it('on a fresh install (nothing legacy), creates Profiles/default/ and a one-entry registry', () => {
    migrateLegacyProfile(root);

    expect(existsSync(profileDir(root, 'default'))).toBe(true);
    ProfilesStore.init({ filePath: profilesJsonPath(root) });
    const file = ProfilesStore.getAll();
    expect(file.profiles).toHaveLength(1);
    expect(file.profiles[0]?.id).toBe('default');
    expect(file.defaultProfileId).toBe('default');
  });

  it('moves a pre-existing flat layout into Profiles/default/ without losing data', () => {
    writeFileSync(join(root, 'preferences.json'), JSON.stringify({ locale: 'tr' }), 'utf8');
    writeFileSync(join(root, 'tepegoz.db'), 'not-really-sqlite', 'utf8');
    // WAL sidecars hold everything written since the last checkpoint — they must travel with the .db.
    writeFileSync(join(root, 'tepegoz.db-wal'), 'wal', 'utf8');
    writeFileSync(join(root, 'tepegoz.db-shm'), 'shm', 'utf8');
    mkdirSync(join(root, 'adblock'), { recursive: true });
    writeFileSync(join(root, 'adblock', 'engine.bin'), 'x', 'utf8');
    mkdirSync(join(root, 'vpn'), { recursive: true });
    writeFileSync(join(root, 'vpn', 'wg0.conf'), 'secret', 'utf8');
    // Chromium's own storage must come along too, or the user silently loses cookies / logins.
    mkdirSync(join(root, 'Partitions', 'tepegoz-web'), { recursive: true });
    writeFileSync(join(root, 'Partitions', 'tepegoz-web', 'Cookies'), 'c', 'utf8');

    migrateLegacyProfile(root);

    const defaultDir = profileDir(root, 'default');
    // Legacy flat files are gone from the root...
    expect(existsSync(join(root, 'preferences.json'))).toBe(false);
    expect(existsSync(join(root, 'tepegoz.db'))).toBe(false);
    expect(existsSync(join(root, 'Partitions'))).toBe(false);
    // ...and present, with content intact, under Profiles/default/ — which is exactly the directory
    // that profile's process will be launched with as its --user-data-dir.
    expect(JSON.parse(readFileSync(join(defaultDir, 'preferences.json'), 'utf8'))).toEqual({
      locale: 'tr',
    });
    expect(existsSync(join(defaultDir, 'tepegoz.db'))).toBe(true);
    expect(existsSync(join(defaultDir, 'tepegoz.db-wal'))).toBe(true);
    expect(existsSync(join(defaultDir, 'tepegoz.db-shm'))).toBe(true);
    expect(existsSync(join(defaultDir, 'adblock', 'engine.bin'))).toBe(true);
    expect(readFileSync(join(defaultDir, 'vpn', 'wg0.conf'), 'utf8')).toBe('secret');
    expect(existsSync(join(defaultDir, 'Partitions', 'tepegoz-web', 'Cookies'))).toBe(true);
  });

  it('leaves a fresh install with no db/prefs untouched (no spurious migration)', () => {
    migrateLegacyProfile(root);
    // Nothing to move — the default dir exists but is empty apart from what stores create later.
    expect(existsSync(join(profileDir(root, 'default'), 'tepegoz.db'))).toBe(false);
  });

  it('is a no-op once profiles.json already exists', () => {
    migrateLegacyProfile(root);
    ProfilesStore.init({ filePath: profilesJsonPath(root) });
    ProfilesStore.add({ name: 'Second', colorId: 1 });
    ProfilesStore.reset();

    migrateLegacyProfile(root); // must not overwrite the now-two-profile registry

    ProfilesStore.init({ filePath: profilesJsonPath(root) });
    expect(ProfilesStore.getAll().profiles).toHaveLength(2);
  });
});
