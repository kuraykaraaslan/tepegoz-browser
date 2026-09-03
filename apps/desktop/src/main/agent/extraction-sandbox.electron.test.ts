import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `extraction-sandbox.electron` — the locked-down hidden window a model-authored extraction script runs
 * in. Pinned: the sandbox session is configured once and its request filter cancels everything but
 * `about:`/`data:` (logging what it drops); `runExtraction` loads the CSP data-doc, copies the page
 * HTML in via `innerHTML`, runs the script in isolated world 999, returns its value, wraps any failure
 * (the `EXTRACTION_TIMEOUT_MS` timeout included) as a 422, and always destroys the window.
 */

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { info: vi.fn() } }));
vi.mock('@tepegoz/tool-executor', () => ({ EXTRACTION_TIMEOUT_MS: 40 }));

const win = vi.hoisted(() => ({
  loadURL: vi.fn(() => Promise.resolve()),
  isDestroyed: vi.fn(() => false),
  destroy: vi.fn(),
  webContents: {
    executeJavaScript: vi.fn(() => Promise.resolve('ok')),
    executeJavaScriptInIsolatedWorld: vi.fn((): Promise<unknown> => Promise.resolve({ ok: true })),
  },
}));
const BrowserWindow = vi.hoisted(() =>
  vi.fn(function BrowserWindow(this: Record<string, unknown>, opts: unknown) {
    this.__opts = opts;
    this.loadURL = win.loadURL;
    this.isDestroyed = win.isDestroyed;
    this.destroy = win.destroy;
    this.webContents = win.webContents;
  }),
);
const onBeforeRequest = vi.hoisted(() => vi.fn());
const fromPartition = vi.hoisted(() => vi.fn(() => ({ webRequest: { onBeforeRequest } })));
vi.mock('electron', () => ({ BrowserWindow, session: { fromPartition } }));

type Mod = typeof import('./extraction-sandbox.electron');
async function load(): Promise<Mod> {
  vi.resetModules();
  return import('./extraction-sandbox.electron');
}

beforeEach(() => {
  vi.clearAllMocks();
  win.loadURL.mockResolvedValue(undefined);
  win.isDestroyed.mockReturnValue(false);
  win.webContents.executeJavaScript.mockResolvedValue('ok');
  win.webContents.executeJavaScriptInIsolatedWorld.mockResolvedValue({ ok: true });
});

describe('runExtraction', () => {
  it('loads the CSP doc, copies HTML in, runs the script in world 999, and returns its value', async () => {
    const { runExtraction } = await load();
    const res = await runExtraction({ html: '<h1>Hi</h1>', script: 'return 1' });
    expect(res).toEqual({ ok: true });
    expect(win.loadURL).toHaveBeenCalledWith(expect.stringContaining('data:text/html,'));
    expect(win.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify('<h1>Hi</h1>')),
    );
    expect(win.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(999, [
      { code: 'return 1' },
    ]);
    expect(win.destroy).toHaveBeenCalled();
  });

  it('wraps a script failure as a 422 and still destroys the window', async () => {
    const { runExtraction } = await load();
    win.webContents.executeJavaScriptInIsolatedWorld.mockRejectedValue(new Error('boom'));
    await expect(runExtraction({ html: '', script: 'x' })).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('boom') as string,
    });
    expect(win.destroy).toHaveBeenCalled();
  });

  it('times out at EXTRACTION_TIMEOUT_MS (surfaced through the 422 wrapper)', async () => {
    const { runExtraction } = await load();
    win.webContents.executeJavaScriptInIsolatedWorld.mockReturnValue(new Promise(() => undefined));
    await expect(runExtraction({ html: '', script: 'while(1){}' })).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('timed out') as string,
    });
    expect(win.destroy).toHaveBeenCalled();
  });

  it('does not destroy an already-destroyed window', async () => {
    const { runExtraction } = await load();
    win.isDestroyed.mockReturnValue(true);
    await runExtraction({ html: '', script: 'return 1' });
    expect(win.destroy).not.toHaveBeenCalled();
  });
});

describe('the sandbox session filter', () => {
  it('is configured once and cancels everything but about:/data:', async () => {
    const { runExtraction } = await load();
    await runExtraction({ html: '', script: 'return 1' });
    await runExtraction({ html: '', script: 'return 2' });
    expect(fromPartition).toHaveBeenCalledTimes(1);
    expect(onBeforeRequest).toHaveBeenCalledTimes(1);

    const filter = onBeforeRequest.mock.calls[0]![0] as (
      d: { url: string },
      cb: (r: { cancel: boolean }) => void,
    ) => void;
    const cb = vi.fn();
    filter({ url: 'https://exfil.example/leak' }, cb);
    expect(cb).toHaveBeenCalledWith({ cancel: true });
    cb.mockClear();
    filter({ url: 'data:text/html,x' }, cb);
    expect(cb).toHaveBeenCalledWith({ cancel: false });
  });
});
