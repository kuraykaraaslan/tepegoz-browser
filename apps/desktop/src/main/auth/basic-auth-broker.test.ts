import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The HTTP basic/digest (401) and proxy (407) auth broker. What is pinned:
 *   - a challenge is settled exactly once — whoever gets there first (user answer, 120s timeout,
 *     no window to ask in) — and every non-answer path means "do not authenticate", never a retry;
 *   - credentials pass straight to Chromium's callback and never touch a log line (origin only);
 *   - the server-supplied realm is capped before it reaches the renderer;
 *   - a proxy challenge is labelled as such so the user is not told a website asked;
 *   - an unparseable challenge URL degrades to a bounded string, not a throw.
 */

const focusedWindow = vi.hoisted(() => vi.fn());
vi.mock('../tabs', () => ({ default: { focusedWindow } }));

const loggerInfo = vi.hoisted(() => vi.fn());
const loggerWarn = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/libs', () => ({
  Logger: { info: loggerInfo, warn: loggerWarn, error: vi.fn() },
}));

const findByUrl = vi.hoisted(() =>
  vi.fn(() => Promise.resolve([] as { username: string; encryptedPassword: string }[])),
);
vi.mock('@tepegoz/password-core', () => ({
  PasswordProviderRegistry: { findByUrl },
}));

type Load = typeof import('./basic-auth-broker');

let mod: Load;
let sent: Array<{ channel: string; payload: Record<string, unknown> }>;

/** Let the broker's `.then(...)` continuation (a microtask) run before asserting. */
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: {
      send: (channel: string, payload: Record<string, unknown>) => {
        sent.push({ channel, payload });
      },
    },
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  sent = [];
  focusedWindow.mockReset();
  loggerInfo.mockReset();
  loggerWarn.mockReset();
  findByUrl.mockReset().mockResolvedValue([]);
  mod = await import('./basic-auth-broker');
});
afterEach(() => {
  vi.useRealTimers();
});

/** Register the handler, fire a `login` event, and return the captured `callback` + the sent payload. */
function fireLogin(
  authInfo: { isProxy?: boolean; realm?: string; host?: string; port?: number } = {},
  url = 'https://secure.test/area',
  vault?: { decrypt: (c: { encryptedPassword: string }) => string },
) {
  let loginHandler!: (...a: unknown[]) => void;
  const app = {
    on: (event: string, handler: (...a: unknown[]) => void) => {
      if (event === 'login') loginHandler = handler;
    },
  } as unknown as Electron.App;
  mod.registerBasicAuthHandler(app, vault as never);

  const callback = vi.fn();
  const event = { preventDefault: vi.fn() };
  loginHandler(
    event,
    undefined,
    { url },
    { isProxy: false, realm: '', host: '', port: 0, ...authInfo },
    callback,
  );
  return { callback, event, payload: sent.at(-1)?.payload };
}

describe('a successful answer', () => {
  it('passes the credentials to Chromium and never logs them', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    const { callback, payload } = fireLogin({ realm: 'Staging' });
    const requestId = payload?.requestId as string;

    mod.resolveBasicAuth({ requestId, cancelled: false, username: 'ada', password: 'hunter2' });
    await flush();

    expect(callback).toHaveBeenCalledWith('ada', 'hunter2');
    const logged = JSON.stringify([loggerInfo.mock.calls, loggerWarn.mock.calls]);
    expect(logged).not.toContain('hunter2');
    expect(logged).not.toContain('"ada"');
    expect(logged).toContain('secure.test');
  });

  it('caps the server realm before it reaches the renderer', () => {
    focusedWindow.mockReturnValue(fakeWindow());
    const { payload } = fireLogin({ realm: 'x'.repeat(9999) });
    expect((payload?.realm as string).length).toBe(256);
  });
});

describe('non-answer paths all mean "do not authenticate"', () => {
  it('resolves with no credentials when the user cancels', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    const { callback, payload } = fireLogin();
    mod.resolveBasicAuth({
      requestId: payload?.requestId as string,
      cancelled: true,
      username: '',
      password: '',
    });
    await flush();
    expect(callback).toHaveBeenCalledWith();
  });

  it('resolves with no credentials on the 120s timeout', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    const { callback } = fireLogin();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(callback).toHaveBeenCalledWith();
  });

  it('resolves with no credentials — and never prompts — when there is no window to ask in', async () => {
    focusedWindow.mockReturnValue(null);
    const { callback } = fireLogin();
    await flush();
    expect(sent).toHaveLength(0);
    expect(callback).toHaveBeenCalledWith();
  });

  it('treats a destroyed focused window as no window', async () => {
    focusedWindow.mockReturnValue(fakeWindow(true));
    const { callback } = fireLogin();
    await flush();
    expect(sent).toHaveLength(0);
    expect(callback).toHaveBeenCalledWith();
  });

  it('warns and authenticates with nothing when pushing the prompt to the renderer throws', async () => {
    focusedWindow.mockReturnValue({
      isDestroyed: () => false,
      webContents: {
        send: () => {
          throw new Error('renderer gone');
        },
      },
    });
    const { callback } = fireLogin();
    await flush();
    expect(callback).toHaveBeenCalledWith();
    expect(loggerWarn).toHaveBeenCalledWith(
      'Auth prompt failed',
      expect.objectContaining({ err: expect.stringContaining('renderer gone') as string }),
    );
  });
});

describe('settle-once', () => {
  it('ignores a late answer after the challenge already timed out', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    const { callback, payload } = fireLogin();
    await vi.advanceTimersByTimeAsync(120_000);
    callback.mockClear();

    mod.resolveBasicAuth({
      requestId: payload?.requestId as string,
      cancelled: false,
      username: 'late',
      password: 'late',
    });
    await flush();
    expect(callback).not.toHaveBeenCalled();
  });

  it('ignores a second answer to the same challenge', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    const { callback, payload } = fireLogin();
    const requestId = payload?.requestId as string;
    mod.resolveBasicAuth({ requestId, cancelled: false, username: 'a', password: 'b' });
    await flush();
    callback.mockClear();
    mod.resolveBasicAuth({ requestId, cancelled: false, username: 'c', password: 'd' });
    await flush();
    expect(callback).not.toHaveBeenCalled();
  });

  it('an unknown requestId is a no-op', () => {
    expect(() =>
      mod.resolveBasicAuth({
        requestId: 'auth-999',
        cancelled: true,
        username: '',
        password: '',
      }),
    ).not.toThrow();
  });
});

describe('proxy vs site labelling', () => {
  it('labels a proxy challenge and uses host:port as the origin, not the page URL', () => {
    focusedWindow.mockReturnValue(fakeWindow());
    const { payload } = fireLogin({ isProxy: true, host: 'proxy.corp', port: 8080 });
    expect(payload?.isProxy).toBe(true);
    expect(payload?.origin).toBe('proxy.corp:8080');
  });

  it('uses the request origin for a site challenge', () => {
    focusedWindow.mockReturnValue(fakeWindow());
    const { payload } = fireLogin({ isProxy: false }, 'https://secure.test:9000/deep/path?x=1');
    expect(payload?.origin).toBe('https://secure.test:9000');
    expect(payload?.isProxy).toBe(false);
  });

  it('degrades an unparseable challenge URL to a bounded string instead of throwing', () => {
    focusedWindow.mockReturnValue(fakeWindow());
    const { payload } = fireLogin({ isProxy: false }, 'not-a-url');
    expect(payload?.origin).toBe('not-a-url');
  });
});

describe('password-vault autofill suggestion', () => {
  it('sends the initial prompt synchronously, with no suggestion yet, then a follow-up once the saved username resolves', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    findByUrl.mockResolvedValue([{ username: 'ada', encryptedPassword: 'enc' }]);
    fireLogin();
    // Synchronous: the first push carries no suggestion, so the dialog never waits on the vault.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.suggestedUsername).toBeUndefined();

    await flush();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.payload.suggestedUsername).toBe('ada');
  });

  it('sends no follow-up when nothing is stored for the origin', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    findByUrl.mockResolvedValue([]);
    fireLogin();
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('sends no follow-up once the challenge already settled before the lookup resolved', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    let resolveLookup!: (v: { username: string; encryptedPassword: string }[]) => void;
    findByUrl.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );
    const { payload } = fireLogin();
    mod.resolveBasicAuth({
      requestId: payload?.requestId as string,
      cancelled: false,
      username: 'ada',
      password: 'hunter2',
    });
    await flush();
    resolveLookup([{ username: 'ada', encryptedPassword: 'enc' }]);
    await flush();
    expect(sent).toHaveLength(1); // no stale follow-up after the challenge already settled
  });
});

describe('useSavedBasicAuth', () => {
  it('decrypts and answers with the saved credential, never sending the plaintext through the renderer', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    findByUrl.mockResolvedValue([{ username: 'ada', encryptedPassword: 'enc' }]);
    const decrypt = vi.fn(() => 'hunter2');
    const { callback, payload } = fireLogin({}, 'https://secure.test/area', { decrypt });

    await mod.useSavedBasicAuth(payload?.requestId as string);
    expect(decrypt).toHaveBeenCalledWith({ username: 'ada', encryptedPassword: 'enc' });
    expect(callback).toHaveBeenCalledWith('ada', 'hunter2');
    const logged = JSON.stringify([loggerInfo.mock.calls, loggerWarn.mock.calls]);
    expect(logged).not.toContain('hunter2');
  });

  it('is a no-op when nothing is stored for the origin (the dialog stays open)', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    findByUrl.mockResolvedValue([]);
    const { callback, payload } = fireLogin({}, 'https://secure.test/area', { decrypt: vi.fn() });

    await mod.useSavedBasicAuth(payload?.requestId as string);
    expect(callback).not.toHaveBeenCalled();
  });

  it('is a no-op when no vault was attached at registration', async () => {
    focusedWindow.mockReturnValue(fakeWindow());
    findByUrl.mockResolvedValue([{ username: 'ada', encryptedPassword: 'enc' }]);
    const { callback, payload } = fireLogin(); // no vault argument

    await mod.useSavedBasicAuth(payload?.requestId as string);
    expect(callback).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown or already-settled requestId', async () => {
    await expect(mod.useSavedBasicAuth('auth-999')).resolves.toBeUndefined();
  });
});
