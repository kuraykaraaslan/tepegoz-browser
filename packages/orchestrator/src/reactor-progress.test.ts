import { describe, it, expect } from 'vitest';
import type { StepOutcome } from './executor';
import { createProgressTracker } from './reactor-progress';

const ok = (result: unknown): StepOutcome => ({
  stepId: 's',
  tool: 't',
  args: {},
  ok: true,
  result,
  durationMs: 0,
});
const fail = (): StepOutcome => ({
  stepId: 's',
  tool: 't',
  args: {},
  ok: false,
  error: { isError: true, code: 'INTERNAL_ERROR', message: 'x', retryable: false },
  durationMs: 0,
});

describe('createProgressTracker', () => {
  it('a read establishes a baseline (neutral), an UNCHANGED re-read is neutral, a CHANGED page is progress', () => {
    const t = createProgressTracker();
    const page = ok({ url: 'https://x/a', title: 'A', content: 'hello world' });
    expect(t.observe(page, true)).toBe('neutral'); // baseline
    expect(t.observe(page, true)).toBe('neutral'); // same page again
    expect(
      t.observe(ok({ url: 'https://x/a', title: 'A', content: 'a menu opened, more links' }), true),
    ).toBe('progress');
  });

  it('ignores digit-only churn (clocks/counters) so an incidental repaint is not "progress"', () => {
    const t = createProgressTracker();
    expect(
      t.observe(ok({ url: 'https://x/a', title: 'A', content: 'Cart total 12 items 09:00' }), true),
    ).toBe('neutral');
    // Only the numbers changed → masked hash is identical → still no progress.
    expect(
      t.observe(ok({ url: 'https://x/a', title: 'A', content: 'Cart total 34 items 11:45' }), true),
    ).toBe('neutral');
  });

  it('a navigation to a NEW url is progress (read or action)', () => {
    const t = createProgressTracker();
    t.observe(ok({ url: 'https://x/a', title: 'A', content: 'p' }), true); // baseline
    expect(t.observe(ok({ url: 'https://x/b', title: 'B', changed: true }), false)).toBe(
      'progress',
    );
  });

  it('a state-changing action classifies by its reported effect', () => {
    const t = createProgressTracker();
    t.observe(ok({ url: 'https://x/a', title: 'A', content: 'p' }), true); // baseline url
    expect(t.observe(ok({ url: 'https://x/a', title: 'A', changed: true }), false)).toBe(
      'progress',
    ); // menu opened
    expect(
      t.observe(ok({ url: 'https://x/a', title: 'A', changed: false, filled: true }), false),
    ).toBe('progress'); // a fill that worked
    expect(t.observe(ok({ url: 'https://x/a', title: 'A', found: true }), false)).toBe('progress'); // scroll_to_text hit
    expect(t.observe(ok({ url: 'https://x/a', title: 'A', changed: false }), false)).toBe('stall'); // no-op click
  });

  it('a failed ACTION is a stall; a failed READ is neutral', () => {
    const t = createProgressTracker();
    expect(t.observe(fail(), false)).toBe('stall');
    expect(t.observe(fail(), true)).toBe('neutral');
  });
});
