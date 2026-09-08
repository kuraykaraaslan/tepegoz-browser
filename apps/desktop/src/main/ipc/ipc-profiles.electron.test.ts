import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-profiles.ts` — Chrome-style multi-profile IPC (ADR-0045). Process-per-profile, so "switch" is a
 * spawn and the registry (`profiles.json`) is the only shared state. What is pinned: the six channels
 * register, every id / payload is validated before a store call or a spawn, and the two destructive
 * guards hold — the last profile and the in-use profile can never be deleted.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => h.handlers.set(c, fn),
    on: () => undefined,
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({ mainStrings: () => ({ errors: { forbidden: 'forbidden' } }) }));

const state = vi.hoisted(() => ({
  profiles: [
    { id: 'default', name: 'Ada', colorId: 0, createdAt: 1, lastUsedAt: 1 },
    { id: 'profile-1', name: 'Bob', colorId: 1, createdAt: 2, lastUsedAt: 2 },
  ],
  activeId: 'default',
}));
const store = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ profiles: state.profiles })),
  add: vi.fn((input: { name: string; colorId: number }) => ({ id: 'profile-2', ...input })),
  rename: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@tepegoz/profiles/store', () => ({ default: store }));
vi.mock('@tepegoz/profiles', () => ({ nextUnusedColorId: () => 3 }));

const launch = vi.hoisted(() => vi.fn());
vi.mock('../profiles/profile-launcher', () => ({ launchProfile: launch }));
vi.mock('../profiles/profile-boot', () => ({ activeProfileId: () => state.activeId }));
const rm = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({ rmSync: rm }));
vi.mock('../profiles/profile-paths', () => ({
  profileDir: (_root: string, id: string) => `/root/Profiles/${id}`,
  profilesRoot: () => '/root',
}));

const { registerProfilesIpc } = await import('./ipc-profiles');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const call = (channel: string, payload?: unknown) => h.handlers.get(channel)!(ev, payload);

beforeEach(() => {
  h.handlers.clear();
  vi.clearAllMocks();
  state.activeId = 'default';
  registerProfilesIpc();
});

describe('registerProfilesIpc', () => {
  it('registers exactly the six profile channels', () => {
    expect([...h.handlers.keys()].sort()).toEqual(
      [
        IpcChannels.profilesList,
        IpcChannels.profilesGetActive,
        IpcChannels.profilesCreate,
        IpcChannels.profilesRename,
        IpcChannels.profilesDelete,
        IpcChannels.profilesSwitch,
      ].sort(),
    );
  });

  it('getActive returns THIS process’s profile', () => {
    expect(call(IpcChannels.profilesGetActive)).toMatchObject({ id: 'default', name: 'Ada' });
  });

  it('create auto-names "Profile N" when no name is given', () => {
    call(IpcChannels.profilesCreate, {});
    expect(store.add).toHaveBeenCalledWith({ name: 'Profile 3', colorId: 3 });
  });

  it('rename rejects an unknown id before touching the store', () => {
    expect(() => call(IpcChannels.profilesRename, { id: 'profile-9', name: 'X' })).toThrow();
    expect(store.rename).not.toHaveBeenCalled();
  });

  it('delete refuses the profile in use', () => {
    expect(() => call(IpcChannels.profilesDelete, 'default')).toThrow();
    expect(rm).not.toHaveBeenCalled();
  });

  it('delete refuses the last remaining profile', () => {
    state.profiles = [state.profiles[0]!];
    expect(() => call(IpcChannels.profilesDelete, 'default')).toThrow();
    state.profiles = [
      { id: 'default', name: 'Ada', colorId: 0, createdAt: 1, lastUsedAt: 1 },
      { id: 'profile-1', name: 'Bob', colorId: 1, createdAt: 2, lastUsedAt: 2 },
    ];
  });

  it('delete wipes the directory and drops the registry row for another profile', () => {
    call(IpcChannels.profilesDelete, 'profile-1');
    expect(rm).toHaveBeenCalledWith('/root/Profiles/profile-1', { recursive: true, force: true });
    expect(store.remove).toHaveBeenCalledWith('profile-1');
  });

  it('switch spawns the target profile process', () => {
    call(IpcChannels.profilesSwitch, 'profile-1');
    expect(launch).toHaveBeenCalledWith('profile-1');
  });

  it('switch rejects an unknown id without spawning', () => {
    expect(() => call(IpcChannels.profilesSwitch, 'profile-9')).toThrow();
    expect(launch).not.toHaveBeenCalled();
  });

  it('rejects an id that is not `default | profile-N`', () => {
    expect(() => call(IpcChannels.profilesSwitch, '../escape')).toThrow();
  });
});
