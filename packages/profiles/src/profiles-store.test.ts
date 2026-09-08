import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ProfilesStore from './profiles-store';

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tepegoz-profiles-'));
  filePath = join(dir, 'profiles.json');
  ProfilesStore.reset();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ProfilesStore', () => {
  it('starts empty when no file exists', () => {
    ProfilesStore.init({ filePath });
    expect(ProfilesStore.getAll().profiles).toEqual([]);
  });

  it('adds a profile, assigning it the "default" id first', () => {
    ProfilesStore.init({ filePath });
    const profile = ProfilesStore.add({ name: 'Alice', colorId: 0 });
    expect(profile.id).toBe('default');
    expect(ProfilesStore.getAll().profiles).toHaveLength(1);
  });

  it('persists across re-init', () => {
    ProfilesStore.init({ filePath });
    ProfilesStore.add({ name: 'Alice', colorId: 0 });
    ProfilesStore.reset();
    ProfilesStore.init({ filePath });
    expect(ProfilesStore.getAll().profiles).toHaveLength(1);
    expect(ProfilesStore.getAll().profiles[0]?.name).toBe('Alice');
  });

  it('falls back to empty on a missing file rather than throwing', () => {
    ProfilesStore.init({ filePath: join(dir, 'does-not-exist.json') });
    expect(ProfilesStore.getAll().profiles).toEqual([]);
  });

  it('falls back to empty on a corrupt file rather than throwing', () => {
    writeFileSync(filePath, '{ not json');
    ProfilesStore.init({ filePath });
    expect(ProfilesStore.getAll().profiles).toEqual([]);
  });

  it('re-reads the file before a mutation, so another process’s write is not clobbered', () => {
    ProfilesStore.init({ filePath });
    ProfilesStore.add({ name: 'Alice', colorId: 0 }); // -> default

    // Simulate a second profile's process adding a profile directly to the shared file.
    const external = {
      version: 1,
      profiles: [
        {
          id: 'default',
          name: 'Alice',
          colorId: 0,
          createdAt: 1,
          lastUsedAt: 1,
        },
        {
          id: 'profile-1',
          name: 'Bob',
          colorId: 1,
          createdAt: 2,
          lastUsedAt: 2,
        },
      ],
      defaultProfileId: 'default',
      lastActiveProfileId: 'profile-1',
    };
    writeFileSync(filePath, JSON.stringify(external));

    ProfilesStore.rename('default', 'Alice W.');

    const all = ProfilesStore.getAll();
    expect(all.profiles.map((p) => p.id).sort()).toEqual(['default', 'profile-1']);
    expect(all.profiles.find((p) => p.id === 'default')?.name).toBe('Alice W.');
  });

  it('rename/remove/touchLastUsed round-trip through persistence', () => {
    ProfilesStore.init({ filePath });
    ProfilesStore.add({ name: 'Alice', colorId: 0 });
    ProfilesStore.add({ name: 'Bob', colorId: 1 });
    ProfilesStore.rename('default', 'Alice W.');
    ProfilesStore.touchLastUsed('default');
    expect(ProfilesStore.getAll().lastActiveProfileId).toBe('default');
    ProfilesStore.remove('profile-1');
    expect(ProfilesStore.getAll().profiles.map((p) => p.id)).toEqual(['default']);
  });
});
