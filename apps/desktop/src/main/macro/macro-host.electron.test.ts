import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `createMacroHost` — the desktop `MacroHost` for the deterministic macro runtime. It drives the CDP
 * selector engine (`MacroCdp`) + `TabManager`, auto-waiting on element targeting rather than
 * sleeping. Pinned: `requireWc` fail-fast (409) with no active tab; `resolve`'s located-happy path,
 * highlight gating, and the M2 self-heal fallback (declined / thrown / still-unresolved all fall
 * through to the 404); each action delegating to `MacroCdp` then hiding the cursor; the read-only
 * probes; and `checkPolicy`'s deny / baseline-ask-passes / newly-elevated-ask fail-closed vs
 * confirmed matrix.
 */

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
class PolicyDeniedError extends Error {}
vi.mock('@tepegoz/libs', () => ({ AppError }));
vi.mock('@tepegoz/macro-engine', () => ({ PolicyDeniedError }));

const adapterArgs = vi.hoisted(
  (): { cursorCb?: ((x: number, y: number) => void) | undefined } => ({ cursorCb: undefined }),
);
vi.mock('@tepegoz/human-input', () => ({
  HumanInputAdapter: class {
    constructor(_send: unknown, cursorCb: (x: number, y: number) => void) {
      adapterArgs.cursorCb = cursorCb;
    }
  },
}));

const PolicyKernel = vi.hoisted(() => ({
  evaluate: vi.fn((): { decision: string; reason: string; biometric: boolean } => ({
    decision: 'allow',
    reason: '',
    biometric: false,
  })),
}));
vi.mock('@tepegoz/security-policy', () => ({ PolicyKernel }));

const wcStub = vi.hoisted(() => ({
  debugger: { sendCommand: vi.fn(() => Promise.resolve()) },
  getURL: vi.fn(() => 'https://shop.test/checkout'),
  executeJavaScript: vi.fn((): Promise<unknown> => Promise.resolve('hello world')),
  isLoadingMainFrame: vi.fn(() => false),
  isDestroyed: vi.fn(() => false),
  removeListener: vi.fn(),
  once: vi.fn(),
}));
const tab = vi.hoisted((): { wc: unknown } => ({ wc: wcStub }));
vi.mock('../tabs', () => ({ default: { activeWebContents: () => tab.wc } }));

const MacroCdp = vi.hoisted(() => ({
  resolveChain: vi.fn((): Promise<number | null> => Promise.resolve(7)),
  highlight: vi.fn(() => Promise.resolve()),
  click: vi.fn(() => Promise.resolve()),
  fill: vi.fn(() => Promise.resolve()),
  pressKey: vi.fn(() => Promise.resolve()),
  scroll: vi.fn(() => Promise.resolve()),
  extract: vi.fn(() => Promise.resolve('val')),
}));
vi.mock('../agent/macro-cdp.electron', () => ({ default: MacroCdp }));

const browserHost = vi.hoisted(() => ({ navigate: vi.fn(() => Promise.resolve()) }));
vi.mock('../agent/browser-host.electron', () => ({ browserHost }));

const cursor = vi.hoisted(() => ({
  showPageCursor: vi.fn(),
  hidePageCursor: vi.fn(),
  isUserControlActive: vi.fn(() => false),
}));
vi.mock('../agent/page-cursor.electron', () => cursor);

const { createMacroHost } = await import('./macro-host.electron');

const CHAIN = [{ kind: 'css', value: '#buy' }] as never;
const readCsv = vi.fn(() => Promise.resolve([{ a: '1' }]));
const make = (extra: Partial<Parameters<typeof createMacroHost>[0]> = {}) =>
  createMacroHost({ readCsv, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  tab.wc = wcStub;
  MacroCdp.resolveChain.mockResolvedValue(7);
  wcStub.executeJavaScript.mockResolvedValue('hello world');
  wcStub.isLoadingMainFrame.mockReturnValue(false);
  PolicyKernel.evaluate.mockReturnValue({ decision: 'allow', reason: '', biometric: false });
});

describe('requireWc', () => {
  it('throws a 409 when there is no active tab', async () => {
    tab.wc = null;
    await expect(make().click(CHAIN)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('the cursor-move callback given to HumanInputAdapter', () => {
  it('paints the page cursor on the active view and forwards to deps.onCursorMove', () => {
    const onCursorMove = vi.fn();
    make({ onCursorMove });
    adapterArgs.cursorCb?.(50, 60);
    expect(cursor.showPageCursor).toHaveBeenCalledWith(wcStub, 50, 60);
    expect(onCursorMove).toHaveBeenCalledWith(50, 60);
  });

  it('skips the page cursor when there is no active view, but still forwards the move', () => {
    const onCursorMove = vi.fn();
    make({ onCursorMove });
    tab.wc = null;
    adapterArgs.cursorCb?.(1, 2);
    expect(cursor.showPageCursor).not.toHaveBeenCalled();
    expect(onCursorMove).toHaveBeenCalledWith(1, 2);
  });
});

describe('waitForLoad', () => {
  it('resolves immediately when the main frame is not loading', async () => {
    wcStub.isLoadingMainFrame.mockReturnValue(false);
    await expect(make().waitForLoad(1000)).resolves.toBeUndefined();
    expect(wcStub.once).not.toHaveBeenCalledWith('did-stop-loading', expect.any(Function));
  });

  it('waits for did-stop-loading (then unbinds) when the main frame is still loading', async () => {
    wcStub.isLoadingMainFrame.mockReturnValue(true);
    const p = make().waitForLoad(5000);
    const done = wcStub.once.mock.calls.find((c) => c[0] === 'did-stop-loading')?.[1] as
      | (() => void)
      | undefined;
    expect(done).toBeDefined();
    done!();
    await expect(p).resolves.toBeUndefined();
    expect(wcStub.removeListener).toHaveBeenCalledWith('did-stop-loading', done);
  });

  it('does not touch a destroyed webContents when the load settles', async () => {
    wcStub.isLoadingMainFrame.mockReturnValue(true);
    const p = make().waitForLoad(5000);
    const done = wcStub.once.mock.calls.find((c) => c[0] === 'did-stop-loading')?.[1] as
      | (() => void)
      | undefined;
    wcStub.isDestroyed.mockReturnValue(true);
    done!();
    await expect(p).resolves.toBeUndefined();
    expect(wcStub.removeListener).not.toHaveBeenCalled();
  });
});

describe('highlight', () => {
  it('resolves the chain (self-heal path) without acting on it', async () => {
    const host = make();
    expect(typeof host.highlight).toBe('function');
    await expect(host.highlight!(CHAIN)).resolves.toBeUndefined();
    expect(MacroCdp.resolveChain).toHaveBeenCalled();
  });
});

describe('resolve (via click)', () => {
  it('resolves the chain, highlights, and clicks the located node', async () => {
    await make().click(CHAIN);
    expect(MacroCdp.resolveChain).toHaveBeenCalledWith(wcStub, CHAIN, undefined);
    expect(MacroCdp.highlight).toHaveBeenCalledWith(wcStub, 7);
    expect(MacroCdp.click).toHaveBeenCalledWith(wcStub, 7, expect.anything());
    expect(cursor.hidePageCursor).toHaveBeenCalledWith(wcStub);
  });

  it('skips highlighting when deps.highlight is false', async () => {
    await make({ highlight: false }).click(CHAIN);
    expect(MacroCdp.highlight).not.toHaveBeenCalled();
  });

  it('throws 404 when the chain does not resolve and no healer is wired', async () => {
    MacroCdp.resolveChain.mockResolvedValue(null);
    await expect(make().click(CHAIN)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('falls through to 404 when the healer declines', async () => {
    MacroCdp.resolveChain.mockResolvedValue(null);
    const healSelector = vi.fn(() => Promise.resolve(null));
    await expect(make({ healSelector }).click(CHAIN)).rejects.toMatchObject({ statusCode: 404 });
    expect(healSelector).toHaveBeenCalledWith(CHAIN);
  });

  it('falls through to 404 when the healer throws', async () => {
    MacroCdp.resolveChain.mockResolvedValue(null);
    const healSelector = vi.fn(() => Promise.reject(new Error('model down')));
    await expect(make({ healSelector }).click(CHAIN)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('uses a healed selector when it resolves', async () => {
    MacroCdp.resolveChain.mockResolvedValueOnce(null).mockResolvedValueOnce(42);
    const healSelector = vi.fn(() => Promise.resolve({ kind: 'css', value: '#buy-now' } as never));
    await make({ healSelector }).click(CHAIN);
    expect(MacroCdp.resolveChain).toHaveBeenLastCalledWith(
      wcStub,
      [{ kind: 'css', value: '#buy-now' }],
      3_000,
    );
    expect(MacroCdp.click).toHaveBeenCalledWith(wcStub, 42, expect.anything());
  });

  it('still 404s when the healed selector also fails to resolve', async () => {
    MacroCdp.resolveChain.mockResolvedValue(null);
    const healSelector = vi.fn(() => Promise.resolve({ kind: 'css', value: '#x' } as never));
    await expect(make({ healSelector }).click(CHAIN)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('the actions', () => {
  it('click / fill / press / scroll delegate to MacroCdp and hide the cursor, notifying onCursorHide', async () => {
    const onCursorHide = vi.fn();
    const host = make({ onCursorHide });
    await host.click(CHAIN);
    await host.fill(CHAIN, 'text');
    await host.press('Enter');
    await host.scroll('down', 300);
    expect(MacroCdp.fill).toHaveBeenCalledWith(wcStub, 7, 'text', expect.anything());
    expect(MacroCdp.pressKey).toHaveBeenCalledWith(wcStub, 'Enter', expect.anything());
    expect(MacroCdp.scroll).toHaveBeenCalledWith(wcStub, 'down', 300, expect.anything());
    expect(cursor.hidePageCursor).toHaveBeenCalledTimes(4);
    expect(onCursorHide).toHaveBeenCalledTimes(4);
  });

  it('navigate goes through the scheme-checked browser host', async () => {
    await make().navigate('https://example.com/');
    expect(browserHost.navigate).toHaveBeenCalledWith('https://example.com/');
  });

  it('extract resolves then reads the attribute', async () => {
    expect(await make().extract(CHAIN, 'href')).toBe('val');
    expect(MacroCdp.extract).toHaveBeenCalledWith(wcStub, 7, 'href');
  });
});

describe('the read-only probes', () => {
  it('waitFor / elementExists / elementVisible reflect resolveChain', async () => {
    const host = make();
    MacroCdp.resolveChain.mockResolvedValue(3);
    expect(await host.waitFor(CHAIN, 500)).toBe(true);
    MacroCdp.resolveChain.mockResolvedValue(null);
    expect(await host.elementExists(CHAIN)).toBe(false);
    expect(await host.elementVisible(CHAIN)).toBe(false);
    expect(MacroCdp.resolveChain).toHaveBeenLastCalledWith(wcStub, CHAIN, 0);
  });

  it('pageContainsText matches the page innerText', async () => {
    const host = make();
    expect(await host.pageContainsText('world')).toBe(true);
    wcStub.executeJavaScript.mockResolvedValue(123);
    expect(await host.pageContainsText('world')).toBe(false);
  });

  it('waitForLoad resolves immediately when the main frame is not loading', async () => {
    await expect(make().waitForLoad(1000)).resolves.toBeUndefined();
  });

  it('readCsv forwards to the injected reader', async () => {
    await make().readCsv('hash-1');
    expect(readCsv).toHaveBeenCalledWith('hash-1');
  });

  it('sleep resolves after the given delay', async () => {
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      void make().sleep(50).then(done);
      await vi.advanceTimersByTimeAsync(49);
      expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('checkPolicy', () => {
  /** createMacroHost always wires checkPolicy; MacroHost types it optional. */
  const check = (host: ReturnType<typeof make>, kind: string, tainted: boolean): Promise<void> =>
    host.checkPolicy!(kind as never, tainted);

  it('throws PolicyDeniedError on a deny verdict', async () => {
    PolicyKernel.evaluate.mockReturnValue({
      decision: 'deny',
      reason: 'sensitive',
      biometric: false,
    });
    await expect(check(make(), 'click', false)).rejects.toBeInstanceOf(PolicyDeniedError);
  });

  it('passes a baseline state_change_confirm ask without a fresh prompt', async () => {
    PolicyKernel.evaluate.mockReturnValue({
      decision: 'ask',
      reason: 'state_change_confirm',
      biometric: false,
    });
    await expect(check(make(), 'fill', false)).resolves.toBeUndefined();
  });

  it('fails closed on a newly elevated ask with no confirm handler', async () => {
    PolicyKernel.evaluate.mockReturnValue({
      decision: 'ask',
      reason: 'tainted_value',
      biometric: false,
    });
    await expect(check(make(), 'fill', true)).rejects.toBeInstanceOf(PolicyDeniedError);
  });

  it('proceeds when the confirm handler approves, throws when it declines', async () => {
    PolicyKernel.evaluate.mockReturnValue({
      decision: 'ask',
      reason: 'tainted_value',
      biometric: true,
    });
    await expect(
      check(make({ confirmPolicyAsk: () => Promise.resolve(true) }), 'fill', true),
    ).resolves.toBeUndefined();
    await expect(
      check(make({ confirmPolicyAsk: () => Promise.resolve(false) }), 'fill', true),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
  });
});
