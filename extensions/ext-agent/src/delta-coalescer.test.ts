import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELTA_FLUSH_MS, createDeltaCoalescer } from './delta-coalescer';

describe('delta coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns many fragments into ONE flush', () => {
    // The whole point: a fast provider emits a fragment every few ms, and a setState per fragment
    // re-renders the panel per token.
    const flushes: Map<string, string>[] = [];
    const c = createDeltaCoalescer((b) => flushes.push(new Map(b)));
    for (const part of ['Look', 'ing ', 'at ', 'the ', 'page']) c.push('g1', part);
    expect(flushes).toHaveLength(0); // nothing rendered yet
    vi.advanceTimersByTime(DELTA_FLUSH_MS);
    expect(flushes).toHaveLength(1);
    expect(flushes[0]?.get('g1')).toBe('Looking at the page');
  });

  it('THROTTLES, it does not debounce — a steady stream still flushes on time', () => {
    // Restarting the timer per fragment is the classic mistake here: an uninterrupted stream would
    // defer the flush forever and the user would see nothing at all during the longest turns.
    const flushes: Map<string, string>[] = [];
    const c = createDeltaCoalescer((b) => flushes.push(new Map(b)));
    for (let i = 0; i < 20; i++) {
      c.push('g1', 'x');
      vi.advanceTimersByTime(DELTA_FLUSH_MS / 4);
    }
    expect(flushes.length).toBeGreaterThan(1);
  });

  it('keeps each tab group’s stream separate', () => {
    const flushes: Map<string, string>[] = [];
    const c = createDeltaCoalescer((b) => flushes.push(new Map(b)));
    c.push('g1', 'one');
    c.push('g2', 'two');
    vi.advanceTimersByTime(DELTA_FLUSH_MS);
    expect(flushes[0]?.get('g1')).toBe('one');
    expect(flushes[0]?.get('g2')).toBe('two');
  });

  it('does not flush an empty buffer — a render that changes nothing still costs one', () => {
    let calls = 0;
    const c = createDeltaCoalescer(() => {
      calls += 1;
    });
    vi.advanceTimersByTime(DELTA_FLUSH_MS * 3);
    c.flush();
    expect(calls).toBe(0);
  });

  it('flushes on demand, so a settling run strands nothing in the buffer', () => {
    const flushes: Map<string, string>[] = [];
    const c = createDeltaCoalescer((b) => flushes.push(new Map(b)));
    c.push('g1', 'tail');
    c.flush();
    expect(flushes[0]?.get('g1')).toBe('tail');
  });

  it('drops the buffer and the timer on dispose', () => {
    let calls = 0;
    const c = createDeltaCoalescer(() => {
      calls += 1;
    });
    c.push('g1', 'x');
    c.dispose();
    vi.advanceTimersByTime(DELTA_FLUSH_MS * 3);
    expect(calls).toBe(0);
  });

  it('ignores an empty fragment rather than scheduling a flush for it', () => {
    let calls = 0;
    const c = createDeltaCoalescer(() => {
      calls += 1;
    });
    c.push('g1', '');
    vi.advanceTimersByTime(DELTA_FLUSH_MS * 2);
    expect(calls).toBe(0);
  });

  it('keeps the window inside the range a human reads as streaming', () => {
    expect(DELTA_FLUSH_MS).toBeGreaterThanOrEqual(30);
    expect(DELTA_FLUSH_MS).toBeLessThanOrEqual(50);
  });
});
