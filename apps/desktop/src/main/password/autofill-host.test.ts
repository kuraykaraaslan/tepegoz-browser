import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LoginCredential,
  LoginCredentialMeta,
  PasswordProvider,
} from '@tepegoz/password-core';

/**
 * Autofill's whole job is deciding WHERE a decrypted secret is allowed to land. These tests are written
 * against that decision, not against the DOM plumbing: the interesting cases are the ones where the
 * renderer asks for a credential the current page has no claim to.
 */

const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, payload: unknown) => Promise<unknown>) => {
      handlers.set(channel, fn);
    },
    removeHandler: (channel: string) => handlers.delete(channel),
    on: () => {},
  },
  BrowserWindow: { fromWebContents: () => ({ id: 1 }) },
  app: { isPackaged: false, getLocale: () => 'en' },
}));

// The sender allow-list has its own tests; here every sender is trusted unless a test says otherwise.
const trusted = { value: true };
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: () => trusted.value }));

const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, Logger: logger };
});

vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    errors: {
      forbidden: 'Action blocked by policy',
      notFound: 'Not found',
      badRequest: 'Invalid request',
      badState: 'Invalid state for this operation',
      upstreamDown: 'Service unavailable',
    },
  }),
}));

/** A fake tab. `url` is mutable so a test can navigate it mid-fill. */
function fakeTab(url: string) {
  const tab = {
    url,
    destroyed: false,
    executed: [] as string[],
    scriptResult: 'filled' as string,
    getURL: () => tab.url,
    isDestroyed: () => tab.destroyed,
    executeJavaScript: (src: string) => {
      tab.executed.push(src);
      // Model the in-page guard for real: the script bails when the document moved on.
      if (!src.includes(`"${new URL(tab.url).origin}"`)) return Promise.resolve('origin-changed');
      return Promise.resolve(tab.scriptResult);
    },
  };
  return tab;
}

const windowTabs = {
  active: null as ReturnType<typeof fakeTab> | null,
  byId: new Map<string, ReturnType<typeof fakeTab>>(),
};

const nav = { cb: null as null | ((url: string, wc: unknown, owner: unknown) => void) };
vi.mock('../tabs', () => ({
  default: {
    onNavigation: (fn: (url: string, wc: unknown, owner: unknown) => void) => {
      nav.cb = fn;
      return () => {
        nav.cb = null;
      };
    },
    forSenderWindow: () => ({
      activeWebContents: () => windowTabs.active,
      webContentsForTab: (id: string) => windowTabs.byId.get(id) ?? null,
    }),
  },
}));

function credential(id: string, origin: string): LoginCredential {
  return {
    id,
    url: origin,
    username: `user@${new URL(origin).host}`,
    title: '',
    notes: '',
    providerId: 'local',
    createdAt: 0,
    updatedAt: 0,
    encryptedPassword: Buffer.from(`secret-for-${id}`).toString('base64'),
  };
}

/** Real registry + real origin matching; only storage is faked. */
function provider(creds: LoginCredential[]): PasswordProvider {
  return {
    id: 'local',
    displayName: 'fake',
    capabilities: { canImport: false, canExport: false, canWrite: true, canSync: false },
    list: (): Promise<LoginCredentialMeta[]> => Promise.resolve(creds),
    findById: (id) => Promise.resolve(creds.find((c) => c.id === id) ?? null),
    findByUrl: (origin) => Promise.resolve(creds.filter((c) => c.url === origin)),
    set: () => Promise.reject(new Error('unused')),
    remove: () => Promise.resolve(),
  };
}

const decrypted: string[] = [];
const vault = {
  decrypt: (c: LoginCredential) => {
    const plain = Buffer.from(c.encryptedPassword, 'base64').toString();
    decrypted.push(plain);
    return plain;
  },
};

const BANK = credential('bank-1', 'https://bank.example');
const SHOP = credential('shop-1', 'https://shop.example');

async function fill(payload: unknown): Promise<unknown> {
  const fn = handlers.get('logins:fill');
  if (!fn) throw new Error('logins:fill was never registered');
  return fn({ sender: {}, senderFrame: { url: 'app://chrome' } }, payload);
}

let AutofillHost: typeof import('./autofill-host').default;
let PasswordProviderRegistry: typeof import('@tepegoz/password-core').PasswordProviderRegistry;

beforeEach(async () => {
  handlers.clear();
  decrypted.length = 0;
  trusted.value = true;
  nav.cb = null;
  logger.warn.mockClear();
  windowTabs.active = null;
  windowTabs.byId.clear();
  ({ PasswordProviderRegistry } = await import('@tepegoz/password-core'));
  PasswordProviderRegistry.reset();
  PasswordProviderRegistry.register(provider([BANK, SHOP]));
  AutofillHost = (await import('./autofill-host')).default;
  AutofillHost.attach(vault as never);
});

afterEach(() => {
  AutofillHost.detach();
  PasswordProviderRegistry.reset();
});

describe('autofill target authorization', () => {
  it('fills when the credential belongs to the origin the tab is actually on', async () => {
    const tab = fakeTab('https://bank.example/login');
    windowTabs.active = tab;

    await expect(fill({ credentialId: 'bank-1' })).resolves.toBeUndefined();

    expect(tab.executed).toHaveLength(1);
    expect(tab.executed[0]).toContain('secret-for-bank-1');
    expect(decrypted).toEqual(['secret-for-bank-1']);
  });

  it('refuses a credential stored under a DIFFERENT origin, and never decrypts it', async () => {
    // The vault-dump shape: a hostile renderer knows every id from `logins:list`, points a tab at a
    // page it controls, and replays the ids. Every one must be refused before decryption.
    windowTabs.active = fakeTab('https://evil.example/harvest');

    await expect(fill({ credentialId: 'bank-1' })).rejects.toThrow();
    await expect(fill({ credentialId: 'shop-1' })).rejects.toThrow();

    expect(decrypted).toEqual([]);
    expect(windowTabs.active.executed).toEqual([]);
  });

  it('refuses a credential from another origin even when the page HAS stored credentials', async () => {
    // shop.example is a legitimate saved site; that must not make bank.example's secret reachable.
    windowTabs.active = fakeTab('https://shop.example/checkout');

    await expect(fill({ credentialId: 'bank-1' })).rejects.toThrow();
    expect(decrypted).toEqual([]);
  });

  it('refuses after the tab navigates away between authorization and injection', async () => {
    const tab = fakeTab('https://bank.example/login');
    windowTabs.active = tab;
    // getURL() is read twice: once to authorize, once immediately before injecting. Move the tab in
    // between, exactly as a redirect would.
    let reads = 0;
    tab.getURL = () => {
      reads += 1;
      return reads <= 1 ? 'https://bank.example/login' : 'https://evil.example/';
    };

    await expect(fill({ credentialId: 'bank-1' })).rejects.toThrow();
    expect(tab.executed).toEqual([]);
  });

  it('pins the authorized origin INSIDE the injected script', async () => {
    const tab = fakeTab('https://bank.example/login');
    windowTabs.active = tab;

    await fill({ credentialId: 'bank-1' });

    // The script must carry the origin and compare it against the live document, so the check is
    // atomic with the write rather than racing it.
    expect(tab.executed[0]).toContain('"https://bank.example"');
    expect(tab.executed[0]).toContain('location.origin!==expected');
  });

  it('reports a failure when the in-page guard rejects the document', async () => {
    const tab = fakeTab('https://bank.example/login');
    tab.scriptResult = 'origin-changed';
    windowTabs.active = tab;

    await expect(fill({ credentialId: 'bank-1' })).rejects.toThrow();
  });

  it('reports a failure when the page has no password field instead of silently succeeding', async () => {
    const tab = fakeTab('https://bank.example/login');
    tab.scriptResult = 'no-password-field';
    windowTabs.active = tab;

    await expect(fill({ credentialId: 'bank-1' })).rejects.toThrow();
  });
});

describe('autofill boundary', () => {
  it('rejects an untrusted sender without touching the vault', async () => {
    windowTabs.active = fakeTab('https://bank.example/login');
    trusted.value = false;

    await expect(fill({ credentialId: 'bank-1' })).rejects.toThrow();
    expect(decrypted).toEqual([]);
  });

  it('rejects a malformed payload without touching the vault', async () => {
    windowTabs.active = fakeTab('https://bank.example/login');

    await expect(fill({ credentialId: '' })).rejects.toThrow();
    await expect(fill(null)).rejects.toThrow();
    await expect(fill({ credentialId: 'x'.repeat(200) })).rejects.toThrow();
    expect(decrypted).toEqual([]);
  });

  it('routes to the tab named by tabId rather than whatever is active', async () => {
    const active = fakeTab('https://evil.example/');
    const named = fakeTab('https://bank.example/login');
    windowTabs.active = active;
    windowTabs.byId.set('tab-7', named);

    await fill({ credentialId: 'bank-1', tabId: 'tab-7' });

    expect(named.executed).toHaveLength(1);
    expect(active.executed).toEqual([]);
  });

  it('fails when the named tab does not exist', async () => {
    windowTabs.active = fakeTab('https://bank.example/login');

    await expect(fill({ credentialId: 'bank-1', tabId: 'missing' })).rejects.toThrow();
    expect(decrypted).toEqual([]);
  });
});

describe('on navigation, it offers the matching logins (metadata only)', () => {
  function fakeWin(destroyed = false) {
    return { isDestroyed: () => destroyed, webContents: { send: vi.fn() } };
  }
  // The `onNavigation` callback fires `onPageLoaded` fire-and-forget, so flush the microtask queue.
  const settle = () => new Promise((r) => setTimeout(r, 5));

  it('pushes a metadata-only projection to the navigating tab’s window', async () => {
    const win = fakeWin();
    nav.cb!('https://bank.example/login', {}, win);
    await settle();

    expect(win.webContents.send).toHaveBeenCalledTimes(1);
    const [channel, payload] = win.webContents.send.mock.calls[0]! as [
      string,
      { url: string; matches: Record<string, unknown>[] },
    ];
    expect(channel).toMatch(/autofill/i);
    expect(payload.url).toBe('https://bank.example/login');
    expect(payload.matches).toHaveLength(1);
    expect(payload.matches[0]).toMatchObject({
      id: 'bank-1',
      username: expect.any(String) as string,
    });
    // The encrypted secret must never be in the projection.
    expect(JSON.stringify(payload.matches[0])).not.toContain('encryptedPassword');
  });

  it('sends nothing when the page has no saved logins', async () => {
    const win = fakeWin();
    nav.cb!('https://no-logins.example/', {}, win);
    await settle();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('does nothing for an already-destroyed window', async () => {
    const win = fakeWin(true);
    nav.cb!('https://bank.example/login', {}, win);
    await settle();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('logs and swallows a lookup failure', async () => {
    PasswordProviderRegistry.reset();
    PasswordProviderRegistry.register({
      ...provider([]),
      findByUrl: () => Promise.reject(new Error('vault offline')),
    });
    const win = fakeWin();
    nav.cb!('https://bank.example/login', {}, win);
    await settle();
    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('Autofill lookup failed', expect.any(Object));
  });
});
