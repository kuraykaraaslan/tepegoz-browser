import { beforeEach, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The Scoped Trust Profiles slice of the preload bridge — three stateless read/write calls. The
 * renderer expresses a domain + level; every interpretation happens in main.
 */

const invoke = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
vi.mock('./ipc-invoke', () => ({ invoke }));
vi.mock('electron', () => ({ ipcRenderer: {} }));

const { trustApi } = await import('./api-trust');

beforeEach(() => invoke.mockClear().mockResolvedValue([]));

it('lists with no payload', () => {
  void trustApi.listTrustProfiles();
  expect(invoke).toHaveBeenCalledWith(IpcChannels.trustProfilesList);
});

it('sends the {domain, level} pair on set', () => {
  void trustApi.setTrustProfile('example.com', 'trusted');
  expect(invoke).toHaveBeenCalledWith(IpcChannels.trustProfilesSet, {
    domain: 'example.com',
    level: 'trusted',
  });
});

it('sends the bare domain string on remove', () => {
  void trustApi.removeTrustProfile('example.com');
  expect(invoke).toHaveBeenCalledWith(IpcChannels.trustProfilesRemove, 'example.com');
});
