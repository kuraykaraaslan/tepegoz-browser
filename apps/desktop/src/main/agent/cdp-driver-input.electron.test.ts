import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `cdp-driver-input.electron` — the input/gesture concern for the CDP driver. Pinned: `setFileInputFiles`
 * 409s a non-file-input and a multi-file set on a single input, else sends `DOM.setFileInputFiles` and
 * settles; `clickElement` bails with `occludedBy` when the dispatch-time probe finds a blocker, else
 * dispatches move/press/release and settles; `hoverElement` moves without settling; `fillElement`
 * refuses a disabled widget, drives a readonly widget's popup, and otherwise focuses + select-all +
 * inserts; `selectOption` returns the parsed result (or empty on a schema miss); `sendKeys` sends every
 * expressible chord and collects the rest in `unsupported`; and `scrollPage` signs the wheel delta by
 * direction.
 */

const dom = vi.hoisted(() => ({
  centerOf: vi.fn(() => Promise.resolve({ x: 10, y: 20 })),
  fileInputInfo: vi.fn((): Promise<unknown> => Promise.resolve({ accept: '*', multiple: false })),
  findWidgetOptionInPage: vi.fn((): Promise<unknown> =>
    Promise.resolve({ x: 3, y: 4, label: 'Tuesday' }),
  ),
  isFocused: vi.fn(() => Promise.resolve(true)),
  objectIdFor: vi.fn(() => Promise.resolve('obj-1')),
  probeClickPoint: vi.fn(() => Promise.resolve({ blocker: null as string | null, x: 5, y: 6 })),
  widgetKindOf: vi.fn((): Promise<string | null> => Promise.resolve(null)),
}));
vi.mock('./cdp-driver-dom.electron.js', () => dom);

const SelectResultSchema = vi.hoisted(() => ({ safeParse: vi.fn() }));
vi.mock('./cdp-driver-schemas.electron.js', () => ({
  DEFAULT_SCROLL_PX: 400,
  KEY_MAP: { Enter: { key: 'Enter', code: 'Enter', keyCode: 13 } },
  SELECT_OPTION_FN: 'function(){}',
  SelectResultSchema,
}));

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('@tepegoz/human-input', () => ({ HumanInputAdapter: class {} }));

const parseChords = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/tool-executor', () => ({ parseChords }));

const {
  setFileInputFiles,
  clickElement,
  hoverElement,
  fillElement,
  selectOption,
  sendKeys,
  pressKey,
  scrollPage,
} = await import('./cdp-driver-input.electron');

let wc: { debugger: { sendCommand: ReturnType<typeof vi.fn> } };
let core: {
  ensure: ReturnType<typeof vi.fn>;
  assertSameOrigin: ReturnType<typeof vi.fn>;
  resolveRef: ReturnType<typeof vi.fn>;
  settle: ReturnType<typeof vi.fn>;
};
const calls = (cmd: string): unknown[] =>
  wc.debugger.sendCommand.mock.calls
    .filter((c: unknown[]) => c[0] === cmd)
    .map((c: unknown[]): unknown => c[1]);

beforeEach(() => {
  vi.clearAllMocks();
  wc = {
    debugger: { sendCommand: vi.fn(() => Promise.resolve({})) },
  };
  core = {
    ensure: vi.fn(() => Promise.resolve()),
    assertSameOrigin: vi.fn(),
    resolveRef: vi.fn(() => Promise.resolve({ backendNodeId: 1 })),
    settle: vi.fn(() => Promise.resolve()),
  };
  dom.centerOf.mockResolvedValue({ x: 10, y: 20 });
  dom.fileInputInfo.mockResolvedValue({ accept: '*', multiple: false });
  dom.probeClickPoint.mockResolvedValue({ blocker: null, x: 5, y: 6 });
  dom.widgetKindOf.mockResolvedValue(null);
  dom.isFocused.mockResolvedValue(true);
});

const cast = <T>(v: unknown): T => v as T;

describe('setFileInputFiles', () => {
  it('409s a non-file-input target', async () => {
    dom.fileInputInfo.mockResolvedValue(null);
    await expect(setFileInputFiles(cast(wc), 1, ['a.png'], cast(core))).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('409s a multi-file set on a single-file input', async () => {
    dom.fileInputInfo.mockResolvedValue({ accept: '*', multiple: false });
    await expect(
      setFileInputFiles(cast(wc), 1, ['a.png', 'b.png'], cast(core)),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('sends DOM.setFileInputFiles and settles on the happy path', async () => {
    dom.fileInputInfo.mockResolvedValue({ accept: 'image/*', multiple: true });
    const info = await setFileInputFiles(cast(wc), 1, ['a.png', 'b.png'], cast(core));
    expect(calls('DOM.setFileInputFiles')[0]).toMatchObject({ files: ['a.png', 'b.png'] });
    expect(core.settle).toHaveBeenCalled();
    expect(info).toEqual({ accept: 'image/*', multiple: true });
  });
});

describe('clickElement', () => {
  it('returns occludedBy and does not settle when a blocker covers the point', async () => {
    dom.probeClickPoint.mockResolvedValue({ blocker: 'cookie-banner', x: 0, y: 0 });
    const res = await clickElement(cast(wc), 1, undefined, cast(core));
    expect(res).toEqual({ occludedBy: 'cookie-banner' });
    expect(core.settle).not.toHaveBeenCalled();
  });

  it('dispatches move/press/release at the probe point and settles', async () => {
    const res = await clickElement(cast(wc), 1, undefined, cast(core));
    const mouse = calls('Input.dispatchMouseEvent');
    expect(mouse.map((m) => (m as { type: string }).type)).toEqual([
      'mouseMoved',
      'mousePressed',
      'mouseReleased',
    ]);
    expect(mouse[1]).toMatchObject({ x: 5, y: 6, button: 'left' });
    expect(core.settle).toHaveBeenCalled();
    expect(res).toEqual({ occludedBy: null });
  });

  it('uses the human adapter when one is supplied', async () => {
    const adapter = { idle: vi.fn(() => Promise.resolve()), click: vi.fn(() => Promise.resolve()) };
    await clickElement(cast(wc), 1, cast(adapter), cast(core));
    expect(adapter.idle).toHaveBeenCalled();
    expect(adapter.click).toHaveBeenCalledWith(5, 6);
    expect(calls('Input.dispatchMouseEvent')).toHaveLength(0);
  });
});

describe('hoverElement', () => {
  it('moves the pointer without settling (raw CDP)', async () => {
    await hoverElement(cast(wc), 1, undefined, cast(core));
    expect(calls('Input.dispatchMouseEvent')[0]).toMatchObject({
      type: 'mouseMoved',
      x: 10,
      y: 20,
    });
    expect(core.settle).not.toHaveBeenCalled();
  });
});

describe('fillElement', () => {
  it('refuses a disabled widget-driven field without settling', async () => {
    dom.widgetKindOf.mockResolvedValue('disabled');
    const res = await fillElement(cast(wc), 1, 'hi', undefined, cast(core));
    expect(res).toEqual({ widget: 'disabled' });
    expect(core.settle).not.toHaveBeenCalled();
  });

  it('drives a readonly widget popup: click, wait for the option, click it', async () => {
    dom.widgetKindOf.mockResolvedValue('readonly');
    dom.findWidgetOptionInPage.mockResolvedValue({ x: 33, y: 44, label: 'Tue' });
    const res = await fillElement(cast(wc), 1, 'Tue', undefined, cast(core));
    const mouse = calls('Input.dispatchMouseEvent').filter(
      (m) => (m as { type: string }).type === 'mousePressed',
    );
    expect(mouse).toHaveLength(2);
    expect(res).toEqual({ widget: null });
    expect(core.settle).toHaveBeenCalled();
  });

  it('focuses, selects all, and inserts text for a plain field (raw CDP)', async () => {
    const res = await fillElement(cast(wc), 1, 'hello', undefined, cast(core));
    expect(calls('DOM.focus')).toHaveLength(1);
    expect(calls('Runtime.callFunctionOn')[0]).toMatchObject({ objectId: 'obj-1' });
    expect(calls('Input.insertText')[0]).toEqual({ text: 'hello' });
    expect(res).toEqual({ widget: null });
    expect(core.settle).toHaveBeenCalled();
  });
});

describe('selectOption', () => {
  it('returns the parsed select result', async () => {
    SelectResultSchema.safeParse.mockReturnValue({
      success: true,
      data: { result: { value: { selected: 'B', options: ['A', 'B'] } } },
    });
    const res = await selectOption(cast(wc), 1, 'B', cast(core));
    expect(res).toEqual({ selected: 'B', options: ['A', 'B'] });
    expect(core.settle).toHaveBeenCalled();
  });

  it('returns an empty result when the response fails its schema', async () => {
    SelectResultSchema.safeParse.mockReturnValue({ success: false });
    const res = await selectOption(cast(wc), 1, 'B', cast(core));
    expect(res).toEqual({ selected: null, options: [] });
  });
});

describe('sendKeys', () => {
  it('sends an expressible modifier chord and settles once', async () => {
    parseChords.mockReturnValue({ steps: [{ key: 'a', modifiers: 2 }], malformed: [] });
    const res = await sendKeys(cast(wc), 'Ctrl+A', undefined, cast(core));
    const keyEvents = calls('Input.dispatchKeyEvent');
    expect(keyEvents.map((k) => (k as { type: string }).type)).toEqual(['rawKeyDown', 'keyUp']);
    expect(keyEvents[0]).toMatchObject({ code: 'KeyA', modifiers: 2 });
    expect(res).toEqual({ sent: 1, unsupported: [] });
    expect(core.settle).toHaveBeenCalledTimes(1);
  });

  it('collects malformed and unknown keys in unsupported and does not settle', async () => {
    parseChords.mockReturnValue({ steps: [{ key: 'Nonsense', modifiers: 0 }], malformed: ['??'] });
    const res = await sendKeys(cast(wc), '??+Nonsense', undefined, cast(core));
    expect(res).toEqual({ sent: 0, unsupported: ['??', 'Nonsense'] });
    expect(core.settle).not.toHaveBeenCalled();
  });
});

describe('pressKey', () => {
  it('routes a named key through sendKeys', async () => {
    parseChords.mockReturnValue({ steps: [{ key: 'Enter', modifiers: 0 }], malformed: [] });
    const res = await pressKey(cast(wc), 'Enter', undefined, cast(core));
    expect(res).toEqual({ sent: 1, unsupported: [] });
    expect(calls('Input.dispatchKeyEvent')[0]).toMatchObject({ code: 'Enter' });
  });
});

describe('scrollPage', () => {
  it('signs the wheel delta downward and uses the default distance', async () => {
    await scrollPage(cast(wc), 'down', undefined, undefined, cast(core));
    expect(calls('Input.dispatchMouseEvent')[0]).toMatchObject({ type: 'mouseWheel', deltaY: 400 });
    expect(core.settle).toHaveBeenCalled();
  });

  it('signs the wheel delta upward and honours an explicit amount', async () => {
    await scrollPage(cast(wc), 'up', 120, undefined, cast(core));
    expect(calls('Input.dispatchMouseEvent')[0]).toMatchObject({ deltaY: -120 });
  });
});

/** The human-input realism path: every gesture takes the `adapter !== undefined` branch, which routes
 *  through the adapter's idle/click/moveTo/insertText/pressKey/scroll instead of raw CDP. */
describe('the human-input adapter path', () => {
  interface Adapter {
    idle: ReturnType<typeof vi.fn>;
    click: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    insertText: ReturnType<typeof vi.fn>;
    pressKey: ReturnType<typeof vi.fn>;
    scroll: ReturnType<typeof vi.fn>;
  }
  let adapter: Adapter;

  beforeEach(() => {
    adapter = {
      idle: vi.fn(() => Promise.resolve()),
      click: vi.fn(() => Promise.resolve()),
      moveTo: vi.fn(() => Promise.resolve()),
      insertText: vi.fn(() => Promise.resolve()),
      pressKey: vi.fn(() => Promise.resolve()),
      scroll: vi.fn(() => Promise.resolve()),
    };
  });

  it('hoverElement moves the pointer through the adapter, with no raw CDP move', async () => {
    await hoverElement(cast(wc), 1, cast(adapter), cast(core));
    expect(adapter.idle).toHaveBeenCalled();
    expect(adapter.moveTo).toHaveBeenCalledWith(10, 20);
    expect(calls('Input.dispatchMouseEvent')).toHaveLength(0);
    expect(core.settle).not.toHaveBeenCalled();
  });

  it('fillElement clicks to focus, then select-all + insertText once focus lands', async () => {
    dom.isFocused.mockResolvedValue(true);
    const res = await fillElement(cast(wc), 1, 'hello', cast(adapter), cast(core));
    expect(adapter.click).toHaveBeenCalledTimes(1);
    expect(adapter.click).toHaveBeenCalledWith(10, 20);
    expect(calls('DOM.focus')).toHaveLength(0); // focus took, so no programmatic fallback
    expect(calls('Runtime.callFunctionOn')).toHaveLength(1); // selectAllContent
    expect(adapter.insertText).toHaveBeenCalledWith('hello');
    expect(res).toEqual({ widget: null });
    expect(core.settle).toHaveBeenCalled();
  });

  it('fillElement retries the click three times then falls back to DOM.focus when focus never lands', async () => {
    vi.useFakeTimers();
    try {
      dom.isFocused.mockResolvedValue(false);
      const p = fillElement(cast(wc), 1, 'hi', cast(adapter), cast(core));
      await vi.advanceTimersByTimeAsync(2500); // drain 3 × ~500ms waitForFocus polling budgets
      const res = await p;
      expect(adapter.click).toHaveBeenCalledTimes(3); // attempt 0 + two retries
      expect(dom.centerOf).toHaveBeenCalledTimes(3); // initial + one recompute per retry
      expect(calls('DOM.focus')).toHaveLength(1); // the last-resort programmatic focus
      expect(adapter.insertText).toHaveBeenCalledWith('hi');
      expect(res).toEqual({ widget: null });
      expect(core.settle).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fillElement drives a readonly widget popup through the adapter (two adapter clicks)', async () => {
    dom.widgetKindOf.mockResolvedValue('readonly');
    dom.findWidgetOptionInPage.mockResolvedValue({ x: 33, y: 44, label: 'Tue' });
    const res = await fillElement(cast(wc), 1, 'Tue', cast(adapter), cast(core));
    expect(adapter.click).toHaveBeenNthCalledWith(1, 10, 20); // open the widget at its centre
    expect(adapter.click).toHaveBeenNthCalledWith(2, 33, 44); // click the matched option
    expect(res).toEqual({ widget: null });
    expect(core.settle).toHaveBeenCalled();
  });

  it('fillElement gives up on a readonly widget whose option never renders', async () => {
    vi.useFakeTimers();
    try {
      dom.widgetKindOf.mockResolvedValue('readonly');
      dom.findWidgetOptionInPage.mockResolvedValue(null);
      const p = fillElement(cast(wc), 1, 'Nope', cast(adapter), cast(core));
      await vi.advanceTimersByTimeAsync(1500); // exhaust the ~1000ms waitForWidgetOption budget
      const res = await p;
      expect(res).toEqual({ widget: 'readonly' });
      expect(core.settle).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sendKeys presses the chord through the adapter', async () => {
    parseChords.mockReturnValue({ steps: [{ key: 'Enter', modifiers: 0 }], malformed: [] });
    const res = await sendKeys(cast(wc), 'Enter', cast(adapter), cast(core));
    expect(adapter.idle).toHaveBeenCalled();
    expect(adapter.pressKey).toHaveBeenCalledWith(
      { key: 'Enter', code: 'Enter', keyCode: 13 },
      0,
    );
    expect(calls('Input.dispatchKeyEvent')).toHaveLength(0);
    expect(res).toEqual({ sent: 1, unsupported: [] });
  });

  it('scrollPage scrolls through the adapter', async () => {
    await scrollPage(cast(wc), 'down', undefined, cast(adapter), cast(core));
    expect(adapter.idle).toHaveBeenCalled();
    expect(adapter.scroll).toHaveBeenCalledWith('down', undefined);
    expect(calls('Input.dispatchMouseEvent')).toHaveLength(0);
    expect(core.settle).toHaveBeenCalled();
  });
});

describe('specForStep — printable-key synthesis (via sendKeys, raw CDP)', () => {
  it('synthesises a Digit code + text for a bare number key', async () => {
    parseChords.mockReturnValue({ steps: [{ key: '5', modifiers: 0 }], malformed: [] });
    const res = await sendKeys(cast(wc), '5', undefined, cast(core));
    const down = calls('Input.dispatchKeyEvent')[0] as Record<string, unknown>;
    expect(down).toMatchObject({ type: 'keyDown', code: 'Digit5', text: '5', windowsVirtualKeyCode: 53 });
    expect(res).toEqual({ sent: 1, unsupported: [] });
  });

  it('reports a non-alphanumeric single character as unsupported', async () => {
    parseChords.mockReturnValue({ steps: [{ key: '@', modifiers: 0 }], malformed: [] });
    const res = await sendKeys(cast(wc), '@', undefined, cast(core));
    expect(res).toEqual({ sent: 0, unsupported: ['@'] });
    expect(calls('Input.dispatchKeyEvent')).toHaveLength(0);
  });
});
