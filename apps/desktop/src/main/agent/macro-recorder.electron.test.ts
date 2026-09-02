import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `MacroRecorder` — the Electron/CDP half of the passive macro recorder. It injects the capture
 * script via `Page.addScriptToEvaluateOnNewDocument` (so it survives navigations) plus a one-off
 * `Runtime.evaluate` for the current page, and turns each `Runtime.bindingCalled` payload into a
 * `Step`. Pinned: one recording at a time (409), the sensitive-site lockout at start (403) AND
 * mid-recording (silent drop), the CDP setup/teardown command sequence, the binding-name /
 * shape / parse guards in the message listener, and stop()'s best-effort teardown.
 */

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: logger }));

const isSensitiveSite = vi.hoisted(() => vi.fn(() => false));
vi.mock('@tepegoz/security-policy', () => ({ isSensitiveSite }));

const capture = vi.hoisted(() => ({
  BINDING: '__cap',
  CAPTURE_SRC: '<<capture-src>>',
  CaptureSchema: { parse: vi.fn((v: unknown) => v) },
  toStep: vi.fn((): unknown => ({ kind: 'click', selector: [] })),
}));
vi.mock('@tepegoz/ext-macros/capture-script', () => capture);

type CdpListener = (e: unknown, method: string, params?: unknown) => void;

function fakeWc(url = 'https://shop.test/') {
  let attached = false;
  const dbg = {
    isAttached: vi.fn(() => attached),
    attach: vi.fn(() => {
      attached = true;
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
    sendCommand: vi.fn((method: string) =>
      method === 'Page.addScriptToEvaluateOnNewDocument'
        ? Promise.resolve({ identifier: 'script-1' })
        : Promise.resolve({}),
    ),
  };
  return {
    getURL: vi.fn(() => url),
    isDestroyed: vi.fn(() => false),
    debugger: dbg,
  };
}
type FakeWc = ReturnType<typeof fakeWc>;
const asWc = (w: FakeWc) => w as unknown as Parameters<typeof MacroRecorder.start>[0];

let MacroRecorder: typeof import('./macro-recorder.electron').default;
beforeEach(async () => {
  vi.clearAllMocks();
  isSensitiveSite.mockReturnValue(false);
  capture.CaptureSchema.parse.mockImplementation((v: unknown) => v);
  capture.toStep.mockReturnValue({ kind: 'click', selector: [] });
  vi.resetModules();
  MacroRecorder = (await import('./macro-recorder.electron')).default;
});

/** The `debugger.on('message', …)` listener registered by the last successful start(). */
function cdpListener(wc: FakeWc): CdpListener {
  return wc.debugger.on.mock.calls.find((c) => c[0] === 'message')![1] as CdpListener;
}
const bindingCall = (payload: string) =>
  [{}, 'Runtime.bindingCalled', { name: '__cap', payload }] as const;

describe('start', () => {
  it('runs the CDP setup sequence and injects the capture script two ways', async () => {
    const wc = fakeWc();
    await MacroRecorder.start(asWc(wc), vi.fn());
    expect(wc.debugger.attach).toHaveBeenCalledWith('1.3');
    const methods = wc.debugger.sendCommand.mock.calls.map((c) => c[0]);
    expect(methods).toEqual([
      'Runtime.enable',
      'Page.enable',
      'Runtime.addBinding',
      'Page.addScriptToEvaluateOnNewDocument',
      'Runtime.evaluate',
    ]);
    expect(wc.debugger.sendCommand).toHaveBeenCalledWith('Runtime.addBinding', { name: '__cap' });
    expect(wc.debugger.sendCommand).toHaveBeenCalledWith('Runtime.evaluate', {
      expression: '<<capture-src>>',
    });
  });

  it('does not re-attach a debugger that is already attached', async () => {
    const wc = fakeWc();
    wc.debugger.isAttached.mockReturnValue(true);
    await MacroRecorder.start(asWc(wc), vi.fn());
    expect(wc.debugger.attach).not.toHaveBeenCalled();
  });

  it('rejects a second concurrent recording with a 409', async () => {
    const wc = fakeWc();
    await MacroRecorder.start(asWc(wc), vi.fn());
    await expect(MacroRecorder.start(asWc(fakeWc()), vi.fn())).rejects.toMatchObject({
      statusCode: 409,
      code: 'recordingInProgress',
    });
  });

  it('refuses to start on a sensitive site (403) and touches no debugger', async () => {
    isSensitiveSite.mockReturnValue(true);
    const wc = fakeWc('https://bank.example/login');
    await expect(MacroRecorder.start(asWc(wc), vi.fn())).rejects.toMatchObject({
      statusCode: 403,
      code: 'recordingSensitiveSite',
    });
    expect(wc.debugger.attach).not.toHaveBeenCalled();
  });
});

describe('the Runtime.bindingCalled listener', () => {
  it('emits a Step for a well-formed capture payload', async () => {
    const wc = fakeWc();
    const onStep = vi.fn();
    await MacroRecorder.start(asWc(wc), onStep);
    cdpListener(wc)(...bindingCall(JSON.stringify({ type: 'click' })));
    expect(onStep).toHaveBeenCalledWith({ kind: 'click', selector: [] });
  });

  it('ignores a non-binding method, the wrong binding name, and a non-string payload', async () => {
    const wc = fakeWc();
    const onStep = vi.fn();
    await MacroRecorder.start(asWc(wc), onStep);
    const l = cdpListener(wc);
    l({}, 'Runtime.consoleAPICalled', { name: '__cap', payload: '{}' });
    l(...([{}, 'Runtime.bindingCalled', { name: 'other', payload: '{}' }] as const));
    l(...([{}, 'Runtime.bindingCalled', { name: '__cap', payload: 42 }] as const));
    expect(onStep).not.toHaveBeenCalled();
  });

  it('drops a capture that lands on a sensitive site mid-recording', async () => {
    const wc = fakeWc();
    const onStep = vi.fn();
    await MacroRecorder.start(asWc(wc), onStep);
    isSensitiveSite.mockReturnValue(true);
    cdpListener(wc)(...bindingCall(JSON.stringify({ type: 'click' })));
    expect(onStep).not.toHaveBeenCalled();
  });

  it('swallows an unparseable payload and a null toStep result', async () => {
    const wc = fakeWc();
    const onStep = vi.fn();
    await MacroRecorder.start(asWc(wc), onStep);
    const l = cdpListener(wc);

    capture.CaptureSchema.parse.mockImplementation(() => {
      throw new Error('bad shape');
    });
    l(...bindingCall('not json'));

    capture.CaptureSchema.parse.mockImplementation((v: unknown) => v);
    capture.toStep.mockReturnValue(null);
    l(...bindingCall(JSON.stringify({ type: 'x' })));

    expect(onStep).not.toHaveBeenCalled();
  });
});

describe('stop', () => {
  it('is a no-op when nothing is recording', async () => {
    await MacroRecorder.stop();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('removes the listener and sends the teardown commands', async () => {
    const wc = fakeWc();
    await MacroRecorder.start(asWc(wc), vi.fn());
    await MacroRecorder.stop();
    expect(wc.debugger.removeListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(wc.debugger.sendCommand).toHaveBeenCalledWith(
      'Page.removeScriptToEvaluateOnNewDocument',
      { identifier: 'script-1' },
    );
    expect(wc.debugger.sendCommand).toHaveBeenCalledWith('Runtime.removeBinding', {
      name: '__cap',
    });
  });

  it('stops at listener removal for a destroyed WebContents', async () => {
    const wc = fakeWc();
    await MacroRecorder.start(asWc(wc), vi.fn());
    wc.isDestroyed.mockReturnValue(true);
    wc.debugger.sendCommand.mockClear();
    await MacroRecorder.stop();
    expect(wc.debugger.removeListener).toHaveBeenCalled();
    expect(wc.debugger.sendCommand).not.toHaveBeenCalled();
  });

  it('logs a warning when a teardown command throws', async () => {
    const wc = fakeWc();
    await MacroRecorder.start(asWc(wc), vi.fn());
    wc.debugger.sendCommand.mockRejectedValue(new Error('session gone'));
    await MacroRecorder.stop();
    expect(logger.warn).toHaveBeenCalledWith(
      'macro recorder teardown failed',
      expect.objectContaining({ err: expect.stringContaining('session gone') as string }),
    );
  });

  it('skips the script removal when start could not read a script identifier', async () => {
    const wc = fakeWc();
    wc.debugger.sendCommand.mockImplementation((method: string) =>
      method === 'Page.addScriptToEvaluateOnNewDocument'
        ? Promise.resolve({ nope: true })
        : Promise.resolve({}),
    );
    await MacroRecorder.start(asWc(wc), vi.fn());
    wc.debugger.sendCommand.mockClear();
    wc.debugger.sendCommand.mockResolvedValue({});
    await MacroRecorder.stop();
    const methods = wc.debugger.sendCommand.mock.calls.map((c) => c[0]);
    expect(methods).not.toContain('Page.removeScriptToEvaluateOnNewDocument');
    expect(methods).toContain('Runtime.removeBinding');
  });
});
