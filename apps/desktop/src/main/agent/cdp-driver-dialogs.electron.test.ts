import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `cdp-driver-dialogs.electron` — S3 PR4 JS-dialog + `beforeunload` interception for a driven tab.
 * Pinned: `attachDialogInterceptor` wires the debugger `message` + `will-prevent-unload` listeners
 * once (idempotent) and tells the unload broker to stand down; a `Page.javascriptDialogOpening` is
 * auto-declined (`accept: false`), its truncated message recorded, and a failed `handleJavaScriptDialog`
 * is logged not thrown; `will-prevent-unload` is always `preventDefault`-ed and recorded; the per-tab
 * event buffer is capped; and `interceptionsSince` filters by timestamp (empty for an unattached tab).
 */

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
vi.mock('electron', () => ({}));
vi.mock('@tepegoz/browser-tools', () => ({}));
const suppressUnloadPrompt = vi.hoisted(() => vi.fn());
vi.mock('../navigation/unload-broker', () => ({ suppressUnloadPrompt }));

const { attachDialogInterceptor, interceptionsSince } =
  await import('./cdp-driver-dialogs.electron');

type MsgHandler = (e: unknown, method: string, params?: unknown) => void;
const mkWc = (): {
  debugger: { on: ReturnType<typeof vi.fn>; sendCommand: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
} => ({
  debugger: {
    on: vi.fn(),
    sendCommand: vi.fn(() => Promise.resolve()),
  },
  on: vi.fn(),
  once: vi.fn(),
});
const msgHandlerOf = (wc: ReturnType<typeof mkWc>): MsgHandler =>
  wc.debugger.on.mock.calls.find((c) => c[0] === 'message')![1] as MsgHandler;
const evHandlerOf = (wc: ReturnType<typeof mkWc>, ev: string): ((e: unknown) => void) => {
  const found =
    wc.on.mock.calls.find((c) => c[0] === ev) ?? wc.once.mock.calls.find((c) => c[0] === ev);
  return found![1] as (e: unknown) => void;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('attachDialogInterceptor', () => {
  it('wires the listeners once and tells the unload broker to stand down', () => {
    const wc = mkWc();
    attachDialogInterceptor(wc as never);
    attachDialogInterceptor(wc as never); // idempotent
    expect(wc.debugger.on).toHaveBeenCalledTimes(1);
    expect(suppressUnloadPrompt).toHaveBeenCalledTimes(1);
    expect(wc.on).toHaveBeenCalledWith('will-prevent-unload', expect.any(Function));
    expect(wc.once).toHaveBeenCalledWith('destroyed', expect.any(Function));
  });

  it('auto-declines a JS dialog, records the truncated message, and logs a failed decline', async () => {
    const wc = mkWc();
    attachDialogInterceptor(wc as never);
    const onMsg = msgHandlerOf(wc);
    const t0 = Date.now();

    onMsg(null, 'Runtime.consoleAPICalled', {}); // ignored
    onMsg(null, 'Page.javascriptDialogOpening', { type: 'confirm', message: 'x'.repeat(500) });

    expect(wc.debugger.sendCommand).toHaveBeenCalledWith('Page.handleJavaScriptDialog', {
      accept: false,
    });
    const [ev] = interceptionsSince(wc as never, t0 - 1);
    expect(ev).toMatchObject({ kind: 'dialog' });
    expect((ev as { message: string }).message).toHaveLength(300);

    wc.debugger.sendCommand.mockRejectedValueOnce(new Error('dialog gone'));
    onMsg(null, 'Page.javascriptDialogOpening', { type: 'alert', message: 'hi' });
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.warn).toHaveBeenCalledWith(
      '[dialog] handleJavaScriptDialog failed',
      expect.anything(),
    );
  });

  it('always preventDefaults will-prevent-unload and records it', () => {
    const wc = mkWc();
    attachDialogInterceptor(wc as never);
    const preventDefault = vi.fn();
    evHandlerOf(wc, 'will-prevent-unload')({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(interceptionsSince(wc as never, 0)[0]).toMatchObject({ kind: 'beforeunload' });
  });

  it('caps the per-tab event buffer', () => {
    const wc = mkWc();
    attachDialogInterceptor(wc as never);
    const onMsg = msgHandlerOf(wc);
    for (let i = 0; i < 25; i += 1) {
      onMsg(null, 'Page.javascriptDialogOpening', { type: 'alert', message: String(i) });
    }
    expect(interceptionsSince(wc as never, 0)).toHaveLength(20);
  });

  it('drops the tab state on destroy', () => {
    const wc = mkWc();
    attachDialogInterceptor(wc as never);
    msgHandlerOf(wc)(null, 'Page.javascriptDialogOpening', { type: 'alert', message: 'hi' });
    evHandlerOf(wc, 'destroyed')(undefined);
    expect(interceptionsSince(wc as never, 0)).toEqual([]);
  });
});

describe('interceptionsSince', () => {
  it('is empty for an unattached tab and filters by timestamp otherwise', () => {
    const wc = mkWc();
    expect(interceptionsSince(wc as never, 0)).toEqual([]);

    attachDialogInterceptor(wc as never);
    const onMsg = msgHandlerOf(wc);
    onMsg(null, 'Page.javascriptDialogOpening', { type: 'alert', message: 'old' });
    const cutoff = Date.now() + 1_000_000;
    expect(interceptionsSince(wc as never, cutoff)).toEqual([]);
    expect(interceptionsSince(wc as never, 0)).toHaveLength(1);
  });
});
