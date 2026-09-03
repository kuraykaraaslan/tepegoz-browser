import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `cdp-driver-session.electron` — the session/lifecycle concern for the CDP driver: minting a per-page
 * isolated world and waiting for a page to settle after an interaction. Pinned: `mainFrameIsolated
 * Context` resolves the frame, creates the world and 502s either failed parse; and `waitForPageSettled`
 * bails the moment the `WebContents` is gone, skips the load wait when nothing is loading, threads the
 * network-idle / DOM-quiet / viewport waits, and swallows a DOM-quiet failure with a fixed delay.
 */

const S = vi.hoisted(() => ({
  FrameTreeSchema: { safeParse: vi.fn() },
  IsolatedWorldSchema: { safeParse: vi.fn() },
  NetworkRequestSchema: { safeParse: vi.fn() },
  NetworkCompleteSchema: { safeParse: vi.fn() },
}));
const delay = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('./cdp-driver-schemas.electron.js', () => ({ ...S, delay, SETTLE_MS: 5 }));

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError }));

const session = await import('./cdp-driver-session.electron');

const ok = <T>(data: T) => ({ success: true as const, data });
const bad = { success: false as const };
const cast = <T>(v: unknown): T => v as T;

type Handler = (...a: unknown[]) => void;
interface FakeWc {
  isDestroyed: ReturnType<typeof vi.fn>;
  isLoadingMainFrame: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  emit: (ev: string, ...a: unknown[]) => void;
  debugger: {
    sendCommand: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    emitMessage: (method: string, params?: unknown) => void;
  };
}

function fakeWc(over: Partial<{ destroyed: boolean; loading: boolean }> = {}): FakeWc {
  const evs = new Map<string, Handler>();
  const dbgEvs = new Map<string, Handler>();
  return {
    isDestroyed: vi.fn(() => over.destroyed ?? false),
    isLoadingMainFrame: vi.fn(() => over.loading ?? false),
    once: vi.fn((ev: string, fn: Handler) => evs.set(ev, fn)),
    on: vi.fn((ev: string, fn: Handler) => evs.set(ev, fn)),
    removeListener: vi.fn((ev: string) => evs.delete(ev)),
    emit: (ev: string, ...a: unknown[]) => evs.get(ev)?.(...a),
    debugger: {
      sendCommand: vi.fn(() => Promise.resolve({})),
      on: vi.fn((ev: string, fn: Handler) => dbgEvs.set(ev, fn)),
      removeListener: vi.fn((ev: string) => dbgEvs.delete(ev)),
      emitMessage: (method: string, params?: unknown) =>
        dbgEvs.get('message')?.({}, method, params),
    },
  };
}

const ensure = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  for (const s of Object.values(S)) s.safeParse.mockReturnValue(bad);
  delay.mockResolvedValue(undefined);
  ensure.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mainFrameIsolatedContext', () => {
  it('resolves the main frame and returns the new isolated-world context id', async () => {
    const wc = fakeWc();
    wc.debugger.sendCommand
      .mockResolvedValueOnce({ frameTree: { frame: { id: 'FRAME-1' } } })
      .mockResolvedValueOnce({ executionContextId: 99 });
    S.FrameTreeSchema.safeParse.mockReturnValue(ok({ frameTree: { frame: { id: 'FRAME-1' } } }));
    S.IsolatedWorldSchema.safeParse.mockReturnValue(ok({ executionContextId: 99 }));

    const id = await session.mainFrameIsolatedContext(cast(wc));

    expect(id).toBe(99);
    expect(wc.debugger.sendCommand).toHaveBeenNthCalledWith(1, 'Page.getFrameTree');
    expect(wc.debugger.sendCommand).toHaveBeenNthCalledWith(
      2,
      'Page.createIsolatedWorld',
      expect.objectContaining({ frameId: 'FRAME-1', worldName: 'tepegoz-page-stability' }),
    );
  });

  it('502s when the frame tree cannot be parsed', async () => {
    const wc = fakeWc();
    S.FrameTreeSchema.safeParse.mockReturnValue(bad);
    await expect(session.mainFrameIsolatedContext(cast(wc))).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(wc.debugger.sendCommand).toHaveBeenCalledTimes(1);
  });

  it('502s when the isolated-world reply cannot be parsed', async () => {
    const wc = fakeWc();
    S.FrameTreeSchema.safeParse.mockReturnValue(ok({ frameTree: { frame: { id: 'F' } } }));
    S.IsolatedWorldSchema.safeParse.mockReturnValue(bad);
    await expect(session.mainFrameIsolatedContext(cast(wc))).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});

describe('waitForPageSettled', () => {
  it('returns immediately — without re-attaching — when the WebContents is already gone', async () => {
    const wc = fakeWc({ destroyed: true });
    await session.waitForPageSettled(cast(wc), ensure, 1000);
    expect(ensure).not.toHaveBeenCalled();
    expect(wc.debugger.sendCommand).not.toHaveBeenCalled();
  });

  it('skips the load wait when nothing is loading and threads the quiescence waits', async () => {
    vi.useFakeTimers();
    const wc = fakeWc({ loading: false });
    S.FrameTreeSchema.safeParse.mockReturnValue(ok({ frameTree: { frame: { id: 'F' } } }));
    S.IsolatedWorldSchema.safeParse.mockReturnValue(ok({ executionContextId: 3 }));

    const done = session.waitForPageSettled(cast(wc), ensure, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(ensure).toHaveBeenCalledWith(wc);
    // Runtime.evaluate is used by both the DOM-quiet and viewport passes.
    expect(wc.debugger.sendCommand).toHaveBeenCalledWith(
      'Runtime.evaluate',
      expect.objectContaining({ contextId: 3, awaitPromise: true }),
    );
  });

  it('waits for did-stop-loading when the main frame is still loading', async () => {
    vi.useFakeTimers();
    const wc = fakeWc({ loading: true });
    S.FrameTreeSchema.safeParse.mockReturnValue(ok({ frameTree: { frame: { id: 'F' } } }));
    S.IsolatedWorldSchema.safeParse.mockReturnValue(ok({ executionContextId: 1 }));

    const done = session.waitForPageSettled(cast(wc), ensure, 1000);
    await vi.advanceTimersByTimeAsync(1);
    expect(wc.once).toHaveBeenCalledWith('did-stop-loading', expect.any(Function));
    wc.emit('did-stop-loading');
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(wc.debugger.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('tracks in-flight network requests and settles once they finish and the page goes quiet', async () => {
    vi.useFakeTimers();
    const wc = fakeWc({ loading: false });
    S.FrameTreeSchema.safeParse.mockReturnValue(ok({ frameTree: { frame: { id: 'F' } } }));
    S.IsolatedWorldSchema.safeParse.mockReturnValue(ok({ executionContextId: 1 }));
    S.NetworkRequestSchema.safeParse.mockReturnValue(ok({ requestId: 'r1', type: 'Document' }));
    S.NetworkCompleteSchema.safeParse.mockReturnValue(ok({ requestId: 'r1' }));

    const done = session.waitForPageSettled(cast(wc), ensure, 1000);
    await vi.advanceTimersByTimeAsync(1); // let the ensure() chain resolve + the message listener register
    wc.debugger.emitMessage('Network.requestWillBeSent', { requestId: 'r1' });
    wc.debugger.emitMessage('Network.loadingFinished', { requestId: 'r1' });
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(S.NetworkRequestSchema.safeParse).toHaveBeenCalled();
    expect(S.NetworkCompleteSchema.safeParse).toHaveBeenCalled();
  });

  it('ignores WebSocket/EventSource requests when deciding network idle', async () => {
    vi.useFakeTimers();
    const wc = fakeWc({ loading: false });
    S.FrameTreeSchema.safeParse.mockReturnValue(ok({ frameTree: { frame: { id: 'F' } } }));
    S.IsolatedWorldSchema.safeParse.mockReturnValue(ok({ executionContextId: 1 }));
    S.NetworkRequestSchema.safeParse.mockReturnValue(ok({ requestId: 'ws1', type: 'WebSocket' }));

    const done = session.waitForPageSettled(cast(wc), ensure, 1000);
    await vi.advanceTimersByTimeAsync(1);
    wc.debugger.emitMessage('Network.requestWillBeSent', { requestId: 'ws1' });
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    // A WebSocket never enters the in-flight set, so no completion parse is attempted for it.
    expect(S.NetworkRequestSchema.safeParse).toHaveBeenCalled();
    expect(S.NetworkCompleteSchema.safeParse).not.toHaveBeenCalled();
  });

  it('falls back to a fixed delay when the DOM-quiet probe throws', async () => {
    vi.useFakeTimers();
    const wc = fakeWc({ loading: false });
    S.FrameTreeSchema.safeParse.mockReturnValue(ok({ frameTree: { frame: { id: 'F' } } }));
    S.IsolatedWorldSchema.safeParse.mockReturnValue(ok({ executionContextId: 1 }));
    // First Runtime.evaluate (DOM quiet) rejects; the viewport pass still runs.
    wc.debugger.sendCommand.mockImplementation((method: string) =>
      method === 'Runtime.evaluate' ? Promise.reject(new Error('detached')) : Promise.resolve({}),
    );

    const done = session.waitForPageSettled(cast(wc), ensure, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(delay).toHaveBeenCalled();
  });

  it('stops early when the WebContents is destroyed mid-settle', async () => {
    vi.useFakeTimers();
    const wc = fakeWc({ loading: false });
    let calls = 0;
    wc.isDestroyed.mockImplementation(() => ++calls > 2);
    S.FrameTreeSchema.safeParse.mockReturnValue(ok({ frameTree: { frame: { id: 'F' } } }));
    S.IsolatedWorldSchema.safeParse.mockReturnValue(ok({ executionContextId: 1 }));

    const done = session.waitForPageSettled(cast(wc), ensure, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    // Bailed before the DOM-quiet / viewport Runtime.evaluate passes.
    expect(wc.debugger.sendCommand).not.toHaveBeenCalledWith('Runtime.evaluate', expect.anything());
  });
});
