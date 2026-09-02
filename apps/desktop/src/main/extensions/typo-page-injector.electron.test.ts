import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The nav handler fires `void inject(...)`; let its await chain settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * `TypoPageInjector` — injects the capture script + a `Runtime.addBinding` bridge into browsing tabs
 * so the typo underliner can spell-check page text off the main thread. Pinned: `start` wires one
 * `TabManager.onNavigation` handler; a navigation to an active page attaches the debugger, inserts
 * the themed CSS and evaluates the script; a destroyed / inactive tab is skipped; the binding
 * listener is attached once per WebContents; and a `Runtime.bindingCalled` payload is validated
 * (wrong method / binding / shape dropped) and, when the origin is still active, relayed to
 * `typoHost.check` and the result posted back to the page.
 */

const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

vi.mock('./typo-page-injector-theme.electron', () => ({ typoCss: () => '.typo{}' }));
vi.mock('./typo-page-injector-script-head.electron', () => ({ TYPO_SCRIPT_HEAD: 'HEAD;' }));
vi.mock('./typo-page-injector-script-tail.electron', () => ({ TYPO_SCRIPT_TAIL: 'TAIL;' }));

const typoHost = vi.hoisted(() => ({
  isActiveForPage: vi.fn(() => true),
  check: vi.fn(() => Promise.resolve({ issues: [] })),
}));
vi.mock('./typo-host.electron', () => ({ default: typoHost }));

const tm = vi.hoisted(() => ({ onNavigation: vi.fn() }));
vi.mock('../tabs', () => ({ default: tm }));

type Listener = (e: unknown, method: string, params?: unknown) => void;
function fakeWc(url = 'https://page.test/article') {
  const dbg = {
    isAttached: vi.fn(() => false),
    attach: vi.fn(),
    sendCommand: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  return {
    debugger: dbg,
    getURL: vi.fn(() => url),
    isDestroyed: vi.fn(() => false),
    insertCSS: vi.fn(() => Promise.resolve()),
    executeJavaScript: vi.fn(() => Promise.resolve()),
    once: vi.fn(),
  };
}
type FakeWc = ReturnType<typeof fakeWc>;

let TypoPageInjector: typeof import('./typo-page-injector.electron').default;
beforeEach(async () => {
  vi.clearAllMocks();
  typoHost.isActiveForPage.mockReturnValue(true);
  typoHost.check.mockResolvedValue({ issues: [] });
  vi.resetModules();
  TypoPageInjector = (await import('./typo-page-injector.electron')).default;
});

/** Run start(), return the nav handler it registered. */
function navHandler(): (url: string, wc: FakeWc) => void {
  TypoPageInjector.start();
  return tm.onNavigation.mock.calls[0]![0] as (url: string, wc: FakeWc) => void;
}
/** The `debugger.on('message', …)` listener registered for a wc after an inject. */
function bindingListener(wc: FakeWc): Listener {
  return wc.debugger.on.mock.calls.find((c) => c[0] === 'message')![1] as Listener;
}
const bindingCall = (payload: string) =>
  [{}, 'Runtime.bindingCalled', { name: '__tepegozTypoPost', payload }] as const;

describe('start + inject', () => {
  it('wires exactly one navigation handler', () => {
    TypoPageInjector.start();
    expect(tm.onNavigation).toHaveBeenCalledTimes(1);
  });

  it('attaches the debugger, inserts the themed CSS and evaluates the concatenated script', async () => {
    const wc = fakeWc();
    navHandler()('https://page.test/article', wc);
    await flush();
    expect(wc.debugger.attach).toHaveBeenCalledWith('1.3');
    expect(wc.debugger.sendCommand).toHaveBeenCalledWith('Runtime.enable');
    expect(wc.insertCSS).toHaveBeenCalledWith('.typo{}');
    expect(wc.executeJavaScript).toHaveBeenCalledWith('HEAD;TAIL;', true);
  });

  it('skips a destroyed or inactive tab', async () => {
    const dead = fakeWc();
    dead.isDestroyed.mockReturnValue(true);
    navHandler()('https://page.test/', dead);
    await flush();
    expect(dead.debugger.attach).not.toHaveBeenCalled();

    typoHost.isActiveForPage.mockReturnValue(false);
    const inactive = fakeWc();
    navHandler()('https://page.test/', inactive);
    await flush();
    expect(inactive.debugger.attach).not.toHaveBeenCalled();
  });

  it('attaches the binding listener only once per WebContents', async () => {
    const wc = fakeWc();
    const nav = navHandler();
    nav('https://page.test/', wc);
    await flush();
    nav('https://page.test/other', wc);
    await flush();
    expect(wc.debugger.on).toHaveBeenCalledTimes(1);
  });

  it('logs a warning when the debugger setup throws', async () => {
    const wc = fakeWc();
    wc.debugger.attach.mockImplementation(() => {
      throw new Error('no debugger');
    });
    navHandler()('https://page.test/', wc);
    await flush();
    expect(logger.warn).toHaveBeenCalledWith(
      'Typo page injection failed',
      expect.objectContaining({ err: expect.stringContaining('no debugger') as string }),
    );
  });
});

describe('the Runtime.bindingCalled listener', () => {
  async function armed(): Promise<FakeWc> {
    const wc = fakeWc();
    navHandler()('https://page.test/', wc);
    await flush();
    wc.executeJavaScript.mockClear();
    return wc;
  }

  it('relays a valid payload to typoHost.check and posts the result back', async () => {
    const wc = await armed();
    bindingListener(wc)(
      ...bindingCall(JSON.stringify({ requestId: 'r1', text: 'teh cat', language: 'en' })),
    );
    expect(typoHost.check).toHaveBeenCalledWith({
      text: 'teh cat',
      language: 'en',
      origin: 'https://page.test',
      aiMode: 'auto',
    });
    await vi.waitFor(() =>
      expect(wc.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining('__tepegozTypoReceive'),
        true,
      ),
    );
  });

  it('ignores a non-binding method, the wrong binding name and a malformed payload', async () => {
    const wc = await armed();
    const l = bindingListener(wc);
    l({}, 'Runtime.consoleAPICalled', { name: '__tepegozTypoPost', payload: '{}' });
    l(...([{}, 'Runtime.bindingCalled', { name: 'other', payload: '{}' }] as const));
    l(...bindingCall('not json'));
    l(...bindingCall(JSON.stringify({ requestId: 'r1' }))); // missing text
    expect(typoHost.check).not.toHaveBeenCalled();
  });

  it('does not check when the page origin is no longer active', async () => {
    const wc = await armed();
    typoHost.isActiveForPage.mockReturnValue(false);
    bindingListener(wc)(...bindingCall(JSON.stringify({ requestId: 'r1', text: 'hello' })));
    expect(typoHost.check).not.toHaveBeenCalled();
  });

  it('does not check when the tab URL has no web origin', async () => {
    const wc = await armed();
    wc.getURL.mockReturnValue('about:blank');
    bindingListener(wc)(...bindingCall(JSON.stringify({ requestId: 'r1', text: 'hello' })));
    expect(typoHost.check).not.toHaveBeenCalled();
  });
});
