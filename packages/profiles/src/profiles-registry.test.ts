import { describe, it, expect } from 'vitest';
import { emptyProfilesFile } from './profiles-model';
import {
  addProfile,
  findProfile,
  nextUnusedColorId,
  removeProfile,
  renameProfile,
  touchLastUsed,
} from './profiles-registry';

describe('profiles-registry', () => {
  it('assigns "default" to the first profile, then sequential profile-N ids', () => {
    let file = emptyProfilesFile();
    const first = addProfile(file, { name: 'Alice', colorId: 0 });
    file = first.file;
    expect(first.profile.id).toBe('default');
    expect(file.defaultProfileId).toBe('default');

    const second = addProfile(file, { name: 'Bob', colorId: 1 });
    file = second.file;
    expect(second.profile.id).toBe('profile-1');

    const third = addProfile(file, { name: 'Carol', colorId: 2 });
    expect(third.profile.id).toBe('profile-2');
  });

  it('reuses the lowest free profile-N id after a deletion', () => {
    let file = emptyProfilesFile();
    file = addProfile(file, { name: 'A', colorId: 0 }).file; // default
    file = addProfile(file, { name: 'B', colorId: 1 }).file; // profile-1
    file = addProfile(file, { name: 'C', colorId: 2 }).file; // profile-2
    file = removeProfile(file, 'profile-1');
    const next = addProfile(file, { name: 'D', colorId: 3 });
    expect(next.profile.id).toBe('profile-1');
  });

  it('rename only touches the display name, never the id', () => {
    let file = emptyProfilesFile();
    file = addProfile(file, { name: 'Alice', colorId: 0 }).file;
    file = renameProfile(file, 'default', 'Alice W.');
    expect(findProfile(file, 'default')?.name).toBe('Alice W.');
  });

  it('falls back lastActiveProfileId to another profile when the active one is removed', () => {
    let file = emptyProfilesFile();
    file = addProfile(file, { name: 'A', colorId: 0 }).file;
    file = addProfile(file, { name: 'B', colorId: 1 }).file;
    file = touchLastUsed(file, 'profile-1');
    expect(file.lastActiveProfileId).toBe('profile-1');
    file = removeProfile(file, 'profile-1');
    expect(file.lastActiveProfileId).toBe('default');
  });

  it('picks the next unused color, wrapping once every slot is taken', () => {
    let file = emptyProfilesFile();
    for (let i = 0; i < 8; i++) {
      file = addProfile(file, { name: `P${i}`, colorId: nextUnusedColorId(file) }).file;
    }
    expect(nextUnusedColorId(file)).toBe(0);
  });
});
