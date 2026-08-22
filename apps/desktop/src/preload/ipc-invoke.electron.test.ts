import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcBoundaryError, encodeBoundaryMessage } from '@tepegoz/desktop-ipc';

/**
 * The renderer half of the boundary — the decode side of what `ipc-helpers.electron.test.ts` encodes.
 *
 * The whole preload bridge was at 0%: every `api-*.ts` slice funnels through this one function, so a
 * regression here is a regression in every typed call the renderer can make. What it must guarantee is
 * narrow and load-bearing: a rejection arrives as a typed `IpcBoundaryError` carrying the SAME status
 * the main process decided, and never as a raw Electron string the renderer would then have to parse
 * itself. Renderer code branches on `statusCode` (403 opens the permission explainer, 401 the auth
 * prompt) — if the code silently collapses to 500, those branches go dead and the user gets a generic
 * failure for a situation the app knows how to explain.
 *
 * Electron's own prefix is the reason the marker is searched rather than anchored, so it is tested
 * against the real shape Electron produces, not against the bare encoded string.
 */

interface Harness {
  /** What `ipcRenderer.invoke` should do: resolve a value, or reject with this error. */
  result: { ok: true; value: unknown } | { ok: false; error: unknown };
  calls: { channel: string; payload: unknown }[];
}

const h = vi.hoisted((): Harness => ({
  result: { ok: true, value: undefined },
  calls: [],
}));

vi.mock('electron', () => ({
  ipcRenderer: {
    // Rejects by THROWING inside an async function rather than `Promise.reject(...)`: the reason is
    // typed `unknown` on purpose — Electron can surface a non-Error, and one of the cases below is
    // exactly that.
    invoke: async (channel: string, payload: unknown) => {
      h.calls.push({ channel, payload });
      await Promise.resolve(); // the real call crosses a process boundary; never resolve synchronously
      if (!h.result.ok) throw h.result.error;
      return h.result.value;
    },
  },
}));

const { invoke } = await import('./ipc-invoke');

/** How Electron actually surfaces a rejected `ipcMain.handle` on the renderer side. */
function asElectronWouldThrow(encoded: string, channel = 'tabs:list'): Error {
  return new Error(`Error invoking remote method '${channel}': Error: ${encoded}`);
}

beforeEach(() => {
  h.result = { ok: true, value: undefined };
  h.calls.length = 0;
});

describe('invoke — the happy path', () => {
  it('passes the channel and payload straight through', async () => {
    h.result = { ok: true, value: { tabs: [] } };

    await invoke('tabs:list' as never, { windowId: 3 });

    expect(h.calls).toEqual([{ channel: 'tabs:list', payload: { windowId: 3 } }]);
  });

  it('returns the resolved value', async () => {
    h.result = { ok: true, value: { runId: 'r-1' } };
    await expect(invoke('agent:run', undefined)).resolves.toEqual({ runId: 'r-1' });
  });

  it('sends undefined for a channel that takes no payload', async () => {
    await invoke('agent:run');
    expect(h.calls[0]?.payload).toBeUndefined();
  });
});

describe('invoke — the decoded boundary', () => {
  it('recovers the status the main process decided, through Electron own prefix', async () => {
    h.result = {
      ok: false,
      error: asElectronWouldThrow(encodeBoundaryMessage('No such tab', 404)),
    };

    const err = await invoke('tabs:list' as never).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IpcBoundaryError);
    expect((err as IpcBoundaryError).statusCode).toBe(404);
    expect((err as IpcBoundaryError).message).toBe('No such tab');
  });

  it('keeps 403 distinct from 500, which is what the permission explainer branches on', async () => {
    h.result = {
      ok: false,
      error: asElectronWouldThrow(encodeBoundaryMessage('Bu isleme izin yok', 403)),
    };

    const err = await invoke('tabs:list' as never).catch((e: unknown) => e);
    expect((err as IpcBoundaryError).statusCode).toBe(403);
  });

  it('survives a multi-line boundary message', async () => {
    const message = 'Upload rejected\nThe file is outside the sandbox';
    h.result = { ok: false, error: asElectronWouldThrow(encodeBoundaryMessage(message, 400)) };

    const err = await invoke('tabs:list' as never).catch((e: unknown) => e);
    expect((err as IpcBoundaryError).message).toBe(message);
    expect((err as IpcBoundaryError).statusCode).toBe(400);
  });

  it('takes the boundary marker, not a bracketed number inside the message', async () => {
    h.result = {
      ok: false,
      error: asElectronWouldThrow(encodeBoundaryMessage('Upstream said [418] teapot', 502)),
    };

    const err = await invoke('tabs:list' as never).catch((e: unknown) => e);
    expect((err as IpcBoundaryError).statusCode).toBe(502);
    expect((err as IpcBoundaryError).message).toBe('Upstream said [418] teapot');
  });

  it('falls back to 500 when the rejection carries no boundary marker at all', async () => {
    // The bridge itself failing (channel not registered, Electron internal) — there is no decided
    // status to recover, and 500 mirrors `toBoundary`'s unknown-error rule rather than inventing one.
    h.result = { ok: false, error: new Error('Error: No handler registered for tabs:list') };

    const err = await invoke('tabs:list' as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IpcBoundaryError);
    expect((err as IpcBoundaryError).statusCode).toBe(500);
  });

  it('handles a rejection that is not an Error at all', async () => {
    h.result = { ok: false, error: 'bridge unavailable' };

    const err = await invoke('tabs:list' as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IpcBoundaryError);
    expect((err as IpcBoundaryError).statusCode).toBe(500);
    expect((err as IpcBoundaryError).message).toBe('bridge unavailable');
  });

  it('always throws the typed error, never the raw Electron one', async () => {
    h.result = { ok: false, error: asElectronWouldThrow(encodeBoundaryMessage('nope', 401)) };

    const err = await invoke('tabs:list' as never).catch((e: unknown) => e);
    // The renderer must never have to know what Electron prefixes look like.
    expect((err as Error).message).not.toContain('Error invoking remote method');
  });
});
