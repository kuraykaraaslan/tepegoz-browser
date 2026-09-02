import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-site-data.ts` — "forget this site" + the unified "clear browsing data" dialog. The properties
 * pinned here are the ones the docblock commits to:
 *   - the credential vault is NEVER in the clear's scope (the plan only *mentions* it);
 *   - the clear touches EVERY browsing partition, for every origin — not just the Direct one — but
 *     never the app-chrome partition;
 *   - one failing origin/partition does not abandon the rest;
 *   - a real clear is recorded in the Event Journal (SiteDataCleared);
 *   - the "clear browsing data" payload is schema-checked before `clearBrowsingData` runs.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
}));
const APP_SESSION = {
  __app: true,
  cookies: { get: vi.fn(() => Promise.resolve([])) },
  clearStorageData: vi.fn(() => Promise.resolve(undefined)),
};
vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => Promise<unknown>) => h.handlers.set(c, fn),
    on: () => undefined,
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
  session: { fromPartition: () => APP_SESSION },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden' } }),
}));
vi.mock('@tepegoz/libs', () => ({
  Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), redact: (s: string) => s },
}));

const clearBrowsingData = vi.hoisted(() => vi.fn(() => Promise.resolve({ cleared: {} })));
vi.mock('../privacy/clear-browsing-data.electron', () => ({ clearBrowsingData }));
const journalAppend = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/persistence', () => ({ EventJournal: { append: journalAppend } }));
const vaultList = vi.hoisted(() => vi.fn(() => Promise.resolve([] as { url: string }[])));
vi.mock('@tepegoz/password-vault', () => ({ passwordVault: { list: vaultList } }));
vi.mock('../window', () => ({ APP_PARTITION: 'persist:tepegoz-chrome' }));
const db = vi.hoisted((): { value: unknown } => ({ value: {} }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

interface FakeSession {
  partition: string;
  session: {
    cookies: { get: ReturnType<typeof vi.fn> };
    clearStorageData: ReturnType<typeof vi.fn>;
  };
  cookies: { get: ReturnType<typeof vi.fn> };
  clearStorageData: ReturnType<typeof vi.fn>;
}
const sessions = vi.hoisted(() => ({ list: [] as FakeSession[] }));
vi.mock('../network/browsing-sessions.electron', () => ({
  default: {
    all: () => sessions.list.map((s) => ({ partition: s.partition, session: s.session })),
  },
}));

const { registerSiteDataIpc } = await import('./ipc-site-data');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };
const call = (channel: string, payload: unknown, event: unknown = ev) =>
  h.handlers.get(channel)!(event, payload);

function fakeSession(partition: string, hasCookies = false): FakeSession {
  const cookies = { get: vi.fn(() => Promise.resolve(hasCookies ? [{ name: 'sid' }] : [])) };
  const clearStorageData = vi.fn(() => Promise.resolve(undefined));
  return { partition, session: { cookies, clearStorageData }, cookies, clearStorageData };
}

beforeEach(() => {
  h.handlers.clear();
  clearBrowsingData.mockClear();
  journalAppend.mockClear();
  vaultList.mockReset().mockResolvedValue([]);
  db.value = {};
  sessions.list = [
    fakeSession('persist:tepegoz-web'),
    fakeSession('persist:tepegoz-web--conn-vpn-a'),
  ];
  registerSiteDataIpc();
});

describe('browsing-data:clear', () => {
  it('rejects a request with no categories before clearing anything', async () => {
    await expect(
      call(IpcChannels.browsingDataClear, { range: 'last-hour', categories: [] }),
    ).rejects.toBeDefined();
    expect(clearBrowsingData).not.toHaveBeenCalled();
  });

  it('delegates a valid request to clearBrowsingData with the db handle', async () => {
    await call(IpcChannels.browsingDataClear, { range: 'last-hour', categories: ['history'] });
    expect(clearBrowsingData).toHaveBeenCalledWith(
      db.value,
      expect.objectContaining({ range: 'last-hour', categories: ['history'] }),
    );
  });
});

describe('site-data:plan', () => {
  it('returns null for a URL with no registrable domain', async () => {
    expect(await call(IpcChannels.siteDataPlan, 'not a url')).toBeNull();
  });

  it('warns "signs you out" when a browsing partition still holds a cookie for the site', async () => {
    sessions.list = [fakeSession('persist:tepegoz-web', true)];
    const plan = (await call(IpcChannels.siteDataPlan, 'https://example.com/')) as {
      warnings: string[];
      site: string;
    };
    expect(plan.site).toBe('example.com');
    expect(plan.warnings).toContain('signs_you_out');
  });

  it('warns about a saved password (compared on eTLD+1) but never clears it', async () => {
    vaultList.mockResolvedValue([{ url: 'https://accounts.example.com/login' }]);
    const plan = (await call(IpcChannels.siteDataPlan, 'https://example.com/')) as {
      warnings: string[];
    };
    expect(plan.warnings).toContain('holds_saved_credentials');
  });
});

describe('site-data:clear', () => {
  it('clears every browsing partition for every origin, and never the app-chrome partition', async () => {
    APP_SESSION.clearStorageData.mockClear();
    const chrome = fakeSession('persist:tepegoz-chrome');
    chrome.session = APP_SESSION;
    const web = fakeSession('persist:tepegoz-web');
    const vpn = fakeSession('persist:tepegoz-web--conn-vpn-a');
    sessions.list = [chrome, web, vpn];

    await call(IpcChannels.siteDataClear, 'https://example.com/');

    expect(web.clearStorageData).toHaveBeenCalled();
    expect(vpn.clearStorageData).toHaveBeenCalled();
    expect(APP_SESSION.clearStorageData).not.toHaveBeenCalled();
  });

  it('keeps clearing the other origins after one clearStorageData rejects', async () => {
    const web = fakeSession('persist:tepegoz-web');
    web.clearStorageData.mockRejectedValueOnce(new Error('locked'));
    sessions.list = [web];

    await expect(call(IpcChannels.siteDataClear, 'https://example.com/')).resolves.not.toBeNull();
    expect(web.clearStorageData.mock.calls.length).toBeGreaterThan(1);
  });

  it('records a SiteDataCleared journal entry when the database is available', async () => {
    await call(IpcChannels.siteDataClear, 'https://example.com/');
    expect(journalAppend).toHaveBeenCalledWith(
      db.value,
      expect.objectContaining({ type: 'SiteDataCleared', actor: 'user', redacted: false }),
    );
  });

  it('does not journal when there is no database, but still returns the plan', async () => {
    db.value = null;
    const out = await call(IpcChannels.siteDataClear, 'https://example.com/');
    expect(out).not.toBeNull();
    expect(journalAppend).not.toHaveBeenCalled();
  });

  it('returns null for an unresolvable URL', async () => {
    expect(await call(IpcChannels.siteDataClear, 'about:blank')).toBeNull();
  });
});

describe('untrusted sender', () => {
  it('cannot reach any site-data handler', async () => {
    await expect(
      call(IpcChannels.siteDataClear, 'https://example.com/', evil),
    ).rejects.toBeDefined();
    await expect(
      call(IpcChannels.browsingDataClear, { range: 'all-time', categories: ['history'] }, evil),
    ).rejects.toBeDefined();
    expect(clearBrowsingData).not.toHaveBeenCalled();
  });
});
