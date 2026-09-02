import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-bookmark-profiles.ts` — importing bookmarks from a browser profile already on this machine.
 * The security shape is the point: detection runs in main and returns records WITHOUT the file path;
 * the renderer picks one by opaque id; the import handler resolves that id by running detection AGAIN
 * and matching — so the untrusted side never names a file for the trusted side to open. Pinned here:
 * the path is projected away, the id is schema-checked, a missing db / vanished profile degrade to a
 * plain error result, a real import calls the store and only then broadcasts, and an untrusted frame
 * reaches neither handler.
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
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden' } }),
}));

const b = vi.hoisted(
  (): {
    detect: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    db: unknown;
  } => ({
    detect: vi.fn(),
    read: vi.fn(() => ({ bookmarks: [] })),
    write: vi.fn(() => ({ imported: 3, skipped: 0, folders: 1, truncated: false, errors: [] })),
    db: {},
  }),
);
vi.mock('@tepegoz/bookmarks', () => ({ writeParsedBookmarksToStore: b.write }));
vi.mock('@tepegoz/bookmarks/profiles', () => ({
  detectBrowserProfiles: b.detect,
  readProfileBookmarks: b.read,
}));
vi.mock('../db/database.electron', () => ({ getDb: () => b.db }));

const { registerBookmarkProfileIpc } = await import('./ipc-bookmark-profiles');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };
const ID = 'chrome:a1b2c3';
const profile = {
  id: ID,
  source: 'chrome',
  browserLabel: 'Chrome',
  profileName: 'Default',
  modifiedAt: 123,
  path: 'C:/Users/secret-name/AppData/Chrome/Default/Bookmarks',
};

let broadcast: ReturnType<typeof vi.fn>;

beforeEach(() => {
  h.handlers.clear();
  b.detect.mockReset().mockReturnValue([profile]);
  b.read.mockClear();
  b.write
    .mockClear()
    .mockReturnValue({ imported: 3, skipped: 0, folders: 1, truncated: false, errors: [] });
  b.db = {};
  broadcast = vi.fn();
  registerBookmarkProfileIpc(broadcast);
});

it('registers exactly the detect + import channels', () => {
  expect([...h.handlers.keys()].sort()).toEqual(
    [IpcChannels.bookmarksDetectProfiles, IpcChannels.bookmarksImportProfile].sort(),
  );
});

describe('detect', () => {
  it('returns the profile records with the filesystem path projected away', () => {
    const out = h.handlers.get(IpcChannels.bookmarksDetectProfiles)?.(ev, undefined) as Record<
      string,
      unknown
    >[];
    expect(out).toEqual([
      { id: ID, source: 'chrome', browserLabel: 'Chrome', profileName: 'Default', modifiedAt: 123 },
    ]);
    expect(out[0]).not.toHaveProperty('path');
  });
});

describe('import', () => {
  it('rejects an id that does not match the opaque-id shape, before any detection', () => {
    for (const bad of ['not valid', 'CHROME:a1', 'chrome:XYZ', 'ab']) {
      expect(() => h.handlers.get(IpcChannels.bookmarksImportProfile)?.(ev, bad)).toThrow();
    }
    expect(b.detect).not.toHaveBeenCalled();
  });

  it('returns a plain error result (no write) when the database is unavailable', () => {
    b.db = null;
    const out = h.handlers.get(IpcChannels.bookmarksImportProfile)?.(ev, ID) as {
      errors: string[];
      imported: number;
    };
    expect(out.imported).toBe(0);
    expect(out.errors).toEqual(['Database is unavailable']);
    expect(b.write).not.toHaveBeenCalled();
  });

  it('returns a plain error result when the chosen profile is no longer present', () => {
    b.detect.mockReturnValue([{ ...profile, id: 'chrome:ffffff' }]);
    const out = h.handlers.get(IpcChannels.bookmarksImportProfile)?.(ev, ID) as {
      errors: string[];
    };
    expect(out.errors).toEqual(['That profile is no longer available.']);
    expect(b.write).not.toHaveBeenCalled();
  });

  it('resolves the id by re-detecting, writes to the store, and broadcasts on a non-empty import', () => {
    const out = h.handlers.get(IpcChannels.bookmarksImportProfile)?.(ev, ID);
    expect(b.read).toHaveBeenCalledWith(profile);
    expect(b.write).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ imported: 3, folders: 1 });
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it('does not broadcast when nothing was imported', () => {
    b.write.mockReturnValue({ imported: 0, skipped: 5, folders: 0, truncated: false, errors: [] });
    h.handlers.get(IpcChannels.bookmarksImportProfile)?.(ev, ID);
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('untrusted sender', () => {
  it('reaches neither handler', () => {
    expect(() => h.handlers.get(IpcChannels.bookmarksDetectProfiles)?.(evil, undefined)).toThrow();
    expect(() => h.handlers.get(IpcChannels.bookmarksImportProfile)?.(evil, ID)).toThrow();
    expect(b.detect).not.toHaveBeenCalled();
    expect(b.write).not.toHaveBeenCalled();
  });
});
