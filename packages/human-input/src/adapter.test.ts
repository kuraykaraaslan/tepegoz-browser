import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HumanInputAdapter } from './adapter';

interface Recorded {
  method: string;
  params: Record<string, unknown>;
}

function makeAdapter(): { adapter: HumanInputAdapter; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const send = (method: string, params: Record<string, unknown>): Promise<unknown> => {
    calls.push({ method, params });
    return Promise.resolve(undefined);
  };
  return { adapter: new HumanInputAdapter(send), calls };
}

const isMouse = (c: Recorded, type: string): boolean =>
  c.method === 'Input.dispatchMouseEvent' && c.params.type === type;

describe('HumanInputAdapter.click', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('focuses via a trusted mousePressed→mouseReleased and never a programmatic focus', async () => {
    const { adapter, calls } = makeAdapter();

    const done = adapter.click(400, 300);
    await vi.runAllTimersAsync();
    await done;

    const pressedIdx = calls.findIndex((c) => isMouse(c, 'mousePressed'));
    const releasedIdx = calls.findIndex((c) => isMouse(c, 'mouseReleased'));

    // A real click is dispatched, press before release, with the pressed/released buttons bitmask set.
    expect(pressedIdx).toBeGreaterThanOrEqual(0);
    expect(releasedIdx).toBeGreaterThan(pressedIdx);
    expect(calls[pressedIdx]?.params.buttons).toBe(1);
    expect(calls[releasedIdx]?.params.buttons).toBe(0);

    // The whole point: no DOM.focus, and no keystrokes during a plain click.
    expect(calls.some((c) => c.method === 'DOM.focus')).toBe(false);
    expect(calls.some((c) => c.method === 'Input.dispatchKeyEvent')).toBe(false);
  });
});

describe('HumanInputAdapter.idle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('awaits a positive delay (resolves only after timers advance)', async () => {
    const { adapter } = makeAdapter();

    let resolved = false;
    const done = adapter.idle().then(() => {
      resolved = true;
    });

    await Promise.resolve(); // flush microtasks — the delay has not elapsed yet
    expect(resolved).toBe(false);

    await vi.runAllTimersAsync();
    await done;
    expect(resolved).toBe(true);
  });
});

/**
 * Visibility-gated realism (S7 PR3). The claim is narrow and worth stating exactly: an off-screen run
 * drops the WAITING and not a single event. If these two counts ever diverge, the optimisation has
 * started removing a detection defence instead of removing waste.
 */
describe('HumanInputAdapter — off-screen pacing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function makeGated(perceivable: boolean): { adapter: HumanInputAdapter; calls: Recorded[] } {
    const calls: Recorded[] = [];
    const send = (method: string, params: Record<string, unknown>): Promise<unknown> => {
      calls.push({ method, params });
      return Promise.resolve(undefined);
    };
    return {
      adapter: new HumanInputAdapter(send, undefined, undefined, undefined, () => perceivable),
      calls,
    };
  }

  /** Drain microtasks without advancing any timer — so a pending sleep stays pending. */
  async function flush(): Promise<void> {
    for (let i = 0; i < 500; i++) await Promise.resolve();
  }

  it('completes with NO timer advance when nothing is on screen', async () => {
    const { adapter } = makeGated(false);
    let done = false;
    void adapter.insertText('hello world').then(() => {
      done = true;
    });
    await flush();
    expect(done).toBe(true);
  });

  it('still waits when the tab IS on screen — the visible path is untouched', async () => {
    const { adapter } = makeGated(true);
    let done = false;
    void adapter.insertText('hello world').then(() => {
      done = true;
    });
    await flush();
    expect(done).toBe(false);
    await vi.runAllTimersAsync();
    expect(done).toBe(true);
  });

  it('dispatches the IDENTICAL event stream either way — timing goes, evidence does not', async () => {
    const offscreen = makeGated(false);
    void offscreen.adapter.insertText('hello world');
    await flush();

    const onscreen = makeGated(true);
    const visible = onscreen.adapter.insertText('hello world');
    await vi.runAllTimersAsync();
    await visible;

    expect(offscreen.calls.length).toBe(onscreen.calls.length);
    expect(offscreen.calls.map((c) => c.method)).toEqual(onscreen.calls.map((c) => c.method));
  });

  it('keeps the full path when no visibility source is wired — absent means perceivable', async () => {
    // An un-wired caller must not silently lose its pacing; the gate has to be asked for.
    const { adapter } = makeAdapter();
    let done = false;
    void adapter.idle().then(() => {
      done = true;
    });
    await flush();
    expect(done).toBe(false);
    await vi.runAllTimersAsync();
    expect(done).toBe(true);
  });
});
