import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-trust.ts` — Scoped Trust Profiles over IPC. Delegation only: none of the five handlers
 * decides anything, they store what the (untrusted) renderer says AFTER the schema has vouched for it.
 * What is pinned: the exact five channels register, the domain/level payloads are validated by
 * `TrustProfileSetSchema` / `TrustDomainSchema` before any host call, import validates the untrusted
 * JSON text and a malformed file maps to a 400 rather than reaching the host, and an untrusted sender
 * frame reaches none of them — a permission row keyed by a look-alike or wrong-cased host is worse than
 * a rejected one because the settings screen still shows it.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => {
      h.handlers.set(c, fn);
    },
    on: () => undefined,
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden' } }),
}));

const host = vi.hoisted(() => ({
  list: vi.fn(() => [{ domain: 'a.com', level: 'trusted' }]),
  set: vi.fn((domain: string, level: string) => [{ domain, level }]),
  remove: vi.fn((domain: string) => [{ domain, removed: true }]),
  exportJson: vi.fn(() => '{"format":"tepegoz.trust-profiles","version":1,"profiles":[]}'),
  importEntries: vi.fn((entries: unknown[]) => entries.length),
}));
vi.mock('../security/trust-profile-host.electron', () => ({
  listTrustProfiles: host.list,
  setTrustProfile: host.set,
  removeTrustProfile: host.remove,
  exportTrustProfilesJson: host.exportJson,
  importTrustProfiles: host.importEntries,
}));

const { registerTrustIpc } = await import('./ipc-trust');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };

beforeEach(() => {
  h.handlers.clear();
  host.list.mockClear();
  host.set.mockClear();
  host.remove.mockClear();
  host.exportJson.mockClear();
  host.importEntries.mockClear();
  registerTrustIpc();
});

it('registers exactly the five trust channels as handlers', () => {
  expect([...h.handlers.keys()].sort()).toEqual(
    [
      IpcChannels.trustProfilesList,
      IpcChannels.trustProfilesSet,
      IpcChannels.trustProfilesRemove,
      IpcChannels.trustProfilesExport,
      IpcChannels.trustProfilesImport,
    ].sort(),
  );
});

describe('trust:list', () => {
  it('returns the stored profiles verbatim', () => {
    expect(h.handlers.get(IpcChannels.trustProfilesList)?.(ev, undefined)).toEqual([
      { domain: 'a.com', level: 'trusted' },
    ]);
  });
});

describe('trust:set', () => {
  it('validates then passes domain + level straight to the host', () => {
    const out = h.handlers.get(IpcChannels.trustProfilesSet)?.(ev, {
      domain: 'example.com',
      level: 'restricted',
    });
    expect(host.set).toHaveBeenCalledWith('example.com', 'restricted');
    expect(out).toEqual([{ domain: 'example.com', level: 'restricted' }]);
  });

  it('rejects a non-registrable / wrong-cased domain before touching the host', () => {
    for (const domain of ['GitHub.com', 'https://example.com', 'localhost', 'a b.com']) {
      expect(() =>
        h.handlers.get(IpcChannels.trustProfilesSet)?.(ev, { domain, level: 'trusted' }),
      ).toThrow();
    }
    expect(host.set).not.toHaveBeenCalled();
  });

  it('rejects a level outside the fixed enum', () => {
    expect(() =>
      h.handlers.get(IpcChannels.trustProfilesSet)?.(ev, { domain: 'example.com', level: 'allow' }),
    ).toThrow();
    expect(host.set).not.toHaveBeenCalled();
  });
});

describe('trust:remove', () => {
  it('validates the domain then delegates', () => {
    h.handlers.get(IpcChannels.trustProfilesRemove)?.(ev, 'example.com');
    expect(host.remove).toHaveBeenCalledWith('example.com');
  });

  it('rejects an invalid domain', () => {
    expect(() => h.handlers.get(IpcChannels.trustProfilesRemove)?.(ev, 'Example.COM')).toThrow();
    expect(host.remove).not.toHaveBeenCalled();
  });
});

describe('trust-profiles:export', () => {
  it('returns the host JSON verbatim, taking no payload', () => {
    expect(h.handlers.get(IpcChannels.trustProfilesExport)?.(ev, undefined)).toBe(
      host.exportJson(),
    );
  });
});

describe('trust-profiles:import', () => {
  it('parses the file and applies the entries through the host, returning imported/skipped', () => {
    const json = JSON.stringify([
      { domain: 'ok.example', level: 'trusted' },
      { domain: 'bad.example', level: 'admin' },
    ]);
    const out = h.handlers.get(IpcChannels.trustProfilesImport)?.(ev, json);
    expect(host.importEntries).toHaveBeenCalledWith([{ domain: 'ok.example', level: 'trusted' }]);
    expect(out).toEqual({ imported: 1, skipped: 1 });
  });

  it('rejects a payload that is not a string before touching the host', () => {
    expect(() => h.handlers.get(IpcChannels.trustProfilesImport)?.(ev, { not: 'a string' })).toThrow();
    expect(host.importEntries).not.toHaveBeenCalled();
  });

  it('maps text that is not JSON to a 400 rather than throwing a raw SyntaxError', () => {
    expect(() => h.handlers.get(IpcChannels.trustProfilesImport)?.(ev, 'not json {')).toThrow();
    expect(host.importEntries).not.toHaveBeenCalled();
  });
});

describe('untrusted sender', () => {
  it('reaches none of the trust host functions on any channel', () => {
    expect(() => h.handlers.get(IpcChannels.trustProfilesList)?.(evil, undefined)).toThrow();
    expect(() =>
      h.handlers.get(IpcChannels.trustProfilesSet)?.(evil, {
        domain: 'example.com',
        level: 'trusted',
      }),
    ).toThrow();
    expect(() => h.handlers.get(IpcChannels.trustProfilesRemove)?.(evil, 'example.com')).toThrow();
    expect(() => h.handlers.get(IpcChannels.trustProfilesExport)?.(evil, undefined)).toThrow();
    expect(() =>
      h.handlers.get(IpcChannels.trustProfilesImport)?.(evil, '[]'),
    ).toThrow();
    expect(host.list).not.toHaveBeenCalled();
    expect(host.set).not.toHaveBeenCalled();
    expect(host.remove).not.toHaveBeenCalled();
    expect(host.exportJson).not.toHaveBeenCalled();
    expect(host.importEntries).not.toHaveBeenCalled();
  });
});
