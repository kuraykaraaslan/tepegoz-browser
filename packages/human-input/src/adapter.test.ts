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
