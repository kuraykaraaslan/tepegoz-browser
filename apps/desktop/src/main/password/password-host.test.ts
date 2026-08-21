import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginCredentialMeta, PasswordProvider } from '@tepegoz/password-core';
import { decodeBoundaryError } from '@tepegoz/desktop-ipc';

/**
 * The login-vault handlers. Two things are asserted that the previous shape got wrong: a failing write
 * must reach the renderer as a failure (it was `void`-ed away), and a malformed payload must be a 400
 * (a bare `.parse()` threw a ZodError, which `toBoundary` reported as a 500 "Internal error").
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
  BrowserWindow: { fromWebContents: () => null },
  app: { isPackaged: false, getLocale: () => 'en' },
}));

vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: () => true }));
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

const removed: string[] = [];
let removeFails = false;

function provider(): PasswordProvider {
  return {
    id: 'local',
    displayName: 'fake',
    capabilities: { canImport: false, canExport: false, canWrite: true, canSync: false },
    list: (): Promise<LoginCredentialMeta[]> => Promise.resolve([]),
    findById: () => Promise.resolve(null),
    findByUrl: () => Promise.resolve([]),
    set: () => Promise.reject(new Error('unused')),
    remove: (id: string) => {
      if (removeFails) return Promise.reject(new Error('disk is read-only'));
      removed.push(id);
      return Promise.resolve();
    },
  };
}

async function invoke(channel: string, payload: unknown): Promise<unknown> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`${channel} was never registered`);
  return fn({ sender: {}, senderFrame: { url: 'app://chrome' } }, payload);
}

/** The status code the renderer would actually decode from the thrown boundary error. */
async function statusOf(channel: string, payload: unknown): Promise<number> {
  try {
    await invoke(channel, payload);
  } catch (err) {
    return decodeBoundaryError(err).statusCode;
  }
  throw new Error('expected a rejection');
}

let PasswordHost: typeof import('./password-host').default;
let PasswordProviderRegistry: typeof import('@tepegoz/password-core').PasswordProviderRegistry;

beforeEach(async () => {
  handlers.clear();
  removed.length = 0;
  removeFails = false;
  ({ PasswordProviderRegistry } = await import('@tepegoz/password-core'));
  PasswordProviderRegistry.reset();
  PasswordProviderRegistry.register(provider());
  PasswordHost = (await import('./password-host')).default;
  PasswordHost.attach();
});

afterEach(() => {
  PasswordProviderRegistry.reset();
});

describe('logins:remove', () => {
  it('removes the credential', async () => {
    await invoke('logins:remove', 'cred-1');
    expect(removed).toEqual(['cred-1']);
  });

  it('surfaces a failed delete instead of reporting success', async () => {
    // The `void local.remove(id)` shape resolved the invoke immediately, so the UI said the password
    // was gone while it was still on disk — and the rejection vanished into unhandledRejection.
    removeFails = true;
    await expect(invoke('logins:remove', 'cred-1')).rejects.toThrow();
  });
});

describe('payload validation', () => {
  it('maps a malformed payload to 400, not 500', async () => {
    expect(await statusOf('logins:remove', 42)).toBe(400);
    expect(await statusOf('logins:remove', '')).toBe(400);
    expect(await statusOf('logins:set', { url: 'https://x.example' })).toBe(400);
    expect(await statusOf('logins:import', { data: 'x', format: 'not-a-format' })).toBe(400);
    expect(await statusOf('logins:export', 'not-a-format')).toBe(400);
  });

  it('does not leak the zod issue text to the renderer', async () => {
    try {
      await invoke('logins:set', { url: 123 });
      throw new Error('expected a rejection');
    } catch (err) {
      const { message } = decodeBoundaryError(err);
      expect(message).toBe('Invalid request');
      expect(message).not.toContain('url');
      expect(message).not.toContain('expected');
    }
  });
});

describe('missing provider', () => {
  it('is a 503 (environment fault), not a renderer fault', async () => {
    PasswordProviderRegistry.reset();
    expect(await statusOf('logins:remove', 'cred-1')).toBe(503);
  });
});
