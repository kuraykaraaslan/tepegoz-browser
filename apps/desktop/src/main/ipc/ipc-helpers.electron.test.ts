import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '@tepegoz/libs';

/**
 * The IPC boundary itself, at runtime.
 *
 * `payload-validation.test.ts` already proves — by scanning source — that all 138 handlers MENTION a
 * validator. It cannot prove what the boundary DOES with what they throw, because it never runs one.
 * That left `ipc-helpers.ts` at 45.71% statements with its two most security-carrying behaviours
 * unexecuted: that an untrusted frame never reaches the handler at all, and that an internal error's
 * text never crosses into the untrusted renderer.
 *
 * Both are silent failures. A boundary that leaked `ENOENT open C:/Users/<name>/.../vault.db` instead
 * of "Internal error" would pass every existing test, ship, and hand a renderer-side attacker a
 * filesystem map. So the assertions here are deliberately about what does NOT cross.
 *
 * `trusted-origin` is mocked rather than exercised: WHICH urls are trusted is owned and tested by
 * `@tepegoz/navigation`. What is under test here is that the verdict is honoured — handler not run,
 * 403 mapped, listener silently dropped.
 */

interface Harness {
  handlers: Map<string, (event: unknown, payload: unknown) => unknown>;
  listeners: Map<string, (event: unknown, payload: unknown) => void>;
  removed: string[];
  /** What `BrowserWindow.fromWebContents` should return — null models a sender with no live window. */
  window: unknown;
}

const h = vi.hoisted((): Harness => ({
  handlers: new Map(),
  listeners: new Map(),
  removed: [],
  window: null,
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      h.handlers.set(channel, fn);
    },
    on: (channel: string, fn: (event: unknown, payload: unknown) => void) => {
      h.listeners.set(channel, fn);
    },
    removeHandler: (channel: string) => {
      h.removed.push(channel);
    },
  },
  BrowserWindow: { fromWebContents: () => h.window },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
const UNTRUSTED = 'https://evil.example/pwn';

vi.mock('../lib/trusted-origin', () => ({
  isTrustedAppUrl: (url: string) => url === 'app://tepegoz/chrome.html',
}));

vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    errors: {
      badRequest: 'Gecersiz istek',
      forbidden: 'Bu isleme izin yok',
      quotaExceeded: 'Kota asildi',
    },
  }),
}));

const {
  assertTrustedSender,
  handle,
  handleAsync,
  onAction,
  onSignal,
  onWindowAction,
  onWindowControl,
  onWindowSignal,
  parsePayload,
  removeHandler,
} = await import('./ipc-helpers');

/** An `IpcMainInvokeEvent` stand-in: only `senderFrame.url` and `sender` are read. */
function event(url: string) {
  return { senderFrame: { url }, sender: {} };
}

/** Invoke a registered handler the way Electron would. */
async function invoke(channel: string, url: string, payload?: unknown): Promise<unknown> {
  const fn = h.handlers.get(channel);
  if (fn === undefined) throw new Error(`no handler for ${channel}`);
  return await fn(event(url), payload);
}

/** Fire a registered fire-and-forget listener the way Electron would. */
function fire(channel: string, url: string, payload?: unknown): void {
  h.listeners.get(channel)?.(event(url), payload);
}

beforeEach(() => {
  h.handlers.clear();
  h.listeners.clear();
  h.removed.length = 0;
  h.window = null;
});

describe('parsePayload', () => {
  const schema = z.object({ tabId: z.string() });

  it('returns the parsed value for a well-formed payload', () => {
    expect(parsePayload(schema, { tabId: 't-1' })).toEqual({ tabId: 't-1' });
  });

  it('maps a schema mismatch to a 400, not the 500 a raw ZodError would become', () => {
    try {
      parsePayload(schema, { tabId: 42 });
      expect.unreachable('a mismatched payload must throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('does not put the zod issue path in the error the renderer will see', () => {
    try {
      parsePayload(schema, { tabId: 42 });
      expect.unreachable('a mismatched payload must throw');
    } catch (err) {
      // The renderer learns "bad request" and nothing about the main process's schema shape.
      expect((err as AppError).message).toBe('Gecersiz istek');
      expect((err as AppError).message).not.toContain('tabId');
    }
  });
});

describe('assertTrustedSender', () => {
  it('accepts our own app content', () => {
    expect(() => {
      assertTrustedSender(event(TRUSTED) as never);
    }).not.toThrow();
  });

  it('rejects any other frame with a 403', () => {
    try {
      assertTrustedSender(event(UNTRUSTED) as never);
      expect.unreachable('an untrusted frame must be rejected');
    } catch (err) {
      expect((err as AppError).statusCode).toBe(403);
    }
  });

  it('rejects a sender with no frame at all', () => {
    expect(() => {
      assertTrustedSender({ senderFrame: undefined } as never);
    }).toThrow();
  });
});

describe('handle — the mapped boundary', () => {
  it('returns the handler result to a trusted caller', async () => {
    handle('tabs:list' as never, () => ({ tabs: 3 }));
    await expect(invoke('tabs:list', TRUSTED)).resolves.toEqual({ tabs: 3 });
  });

  it('never runs the handler for an untrusted frame', async () => {
    const ran = vi.fn(() => 'secret');
    handle('tabs:list' as never, ran);

    await expect(invoke('tabs:list', UNTRUSTED)).rejects.toThrow('[403]');
    expect(ran).not.toHaveBeenCalled();
  });

  it('carries an AppError status and message across encoded', async () => {
    handle('tabs:list' as never, () => {
      throw new AppError('No such tab', 404);
    });

    await expect(invoke('tabs:list', TRUSTED)).rejects.toThrow('[404] No such tab');
  });

  it('sends the LOCALIZED text when the error carries an i18n code', async () => {
    handle('tabs:list' as never, () => {
      throw new AppError('Quota exceeded', 429, 'quotaExceeded');
    });

    // English stays in the log and on the agent path; the person gets their own language.
    await expect(invoke('tabs:list', TRUSTED)).rejects.toThrow('[429] Kota asildi');
  });

  it('falls back to the English message when the code has no translation', async () => {
    handle('tabs:list' as never, () => {
      throw new AppError('Tab is detached', 409, 'noSuchKeyInDict');
    });

    await expect(invoke('tabs:list', TRUSTED)).rejects.toThrow('[409] Tab is detached');
  });

  it('does not leak an internal error text to the untrusted renderer', async () => {
    handle('tabs:list' as never, () => {
      throw new Error('ENOENT: C:/Users/kuray/AppData/Roaming/tepegoz/vault.db');
    });

    const rejection = await invoke('tabs:list', TRUSTED).then(
      () => null,
      (err: Error) => err.message,
    );
    expect(rejection).toBe('[500] Internal error');
    expect(rejection).not.toContain('vault.db');
    expect(rejection).not.toContain('kuray');
  });

  it('maps a thrown non-Error the same way', async () => {
    // Typed `unknown` rather than thrown as a bare literal: a library that rejects with a string is
    // exactly the case `toBoundary`'s unknown-value branch exists for, and the lint rule that forbids
    // throwing a literal is right everywhere except here.
    const notAnError: unknown = 'a bare string, from some library';
    handle('tabs:list' as never, () => {
      throw notAnError;
    });

    await expect(invoke('tabs:list', TRUSTED)).rejects.toThrow('[500] Internal error');
  });
});

describe('handleAsync — the reason it exists', () => {
  it('maps a REJECTED promise, which the sync handle would let escape unmapped', async () => {
    handleAsync('agent:run', () => Promise.reject(new AppError('Model refused', 502)));

    await expect(invoke('agent:run', TRUSTED)).rejects.toThrow('[502] Model refused');
  });

  it('still blocks an untrusted frame before awaiting anything', async () => {
    const ran = vi.fn(() => Promise.resolve('secret'));
    handleAsync('agent:run', ran);

    await expect(invoke('agent:run', 'file:///C:/tmp/attack.html')).rejects.toThrow('[403]');
    expect(ran).not.toHaveBeenCalled();
  });

  it('resolves normally on the happy path', async () => {
    handleAsync('agent:run', () => Promise.resolve({ runId: 'r-1' }));
    await expect(invoke('agent:run', TRUSTED)).resolves.toEqual({ runId: 'r-1' });
  });
});

describe('removeHandler', () => {
  it('tears the channel down', () => {
    removeHandler('tabs:list' as never);
    expect(h.removed).toEqual(['tabs:list']);
  });
});

/** The fire-and-forget listeners: no reply channel, so a rejection is not an option — they DROP. */
describe('onAction', () => {
  const schema = z.object({ id: z.string() });

  it('delivers a valid payload from a trusted frame', () => {
    const fn = vi.fn();
    onAction('tab:close', schema, fn);
    fire('tab:close', TRUSTED, { id: 't-9' });
    expect(fn).toHaveBeenCalledWith({ id: 't-9' });
  });

  it('drops an untrusted frame silently', () => {
    const fn = vi.fn();
    onAction('tab:close', schema, fn);
    fire('tab:close', UNTRUSTED, { id: 't-9' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('drops a malformed payload silently', () => {
    const fn = vi.fn();
    onAction('tab:close', schema, fn);
    fire('tab:close', TRUSTED, { id: 9 });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('onSignal', () => {
  it('fires only for a trusted frame', () => {
    const fn = vi.fn();
    onSignal('chrome:ready', fn);

    fire('chrome:ready', UNTRUSTED);
    expect(fn).not.toHaveBeenCalled();

    fire('chrome:ready', TRUSTED);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('window-scoped listeners', () => {
  const schema = z.object({ index: z.number() });
  const win = { id: 7 };

  it('onWindowAction routes to the SENDER window', () => {
    const fn = vi.fn();
    onWindowAction('tab:select', schema, fn);
    h.window = win;

    fire('tab:select', TRUSTED, { index: 2 });
    expect(fn).toHaveBeenCalledWith(win, { index: 2 });
  });

  it('onWindowAction drops a message whose sender has no live window', () => {
    const fn = vi.fn();
    onWindowAction('tab:select', schema, fn);
    h.window = null;

    fire('tab:select', TRUSTED, { index: 2 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('onWindowAction drops an untrusted frame before it ever resolves a window', () => {
    const fn = vi.fn();
    onWindowAction('tab:select', schema, fn);
    h.window = win;

    fire('tab:select', UNTRUSTED, { index: 2 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('onWindowAction drops a malformed payload', () => {
    const fn = vi.fn();
    onWindowAction('tab:select', schema, fn);
    h.window = win;

    fire('tab:select', TRUSTED, { index: 'two' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('onWindowSignal fires for a trusted frame with a live window, and not otherwise', () => {
    const fn = vi.fn();
    onWindowSignal('window:focus', fn);

    h.window = null;
    fire('window:focus', TRUSTED);
    expect(fn).not.toHaveBeenCalled();

    h.window = win;
    fire('window:focus', UNTRUSTED);
    expect(fn).not.toHaveBeenCalled();

    fire('window:focus', TRUSTED);
    expect(fn).toHaveBeenCalledWith(win);
  });

  it('onWindowControl acts on the sender window only', () => {
    const action = vi.fn();
    onWindowControl('window:minimize', action);

    h.window = null;
    fire('window:minimize', TRUSTED);
    expect(action).not.toHaveBeenCalled();

    h.window = win;
    fire('window:minimize', UNTRUSTED);
    expect(action).not.toHaveBeenCalled();

    fire('window:minimize', TRUSTED);
    expect(action).toHaveBeenCalledWith(win);
  });
});
