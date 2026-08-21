import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import {
  MAX_WAIT_MS,
  MIN_WAIT_MS,
  buildWaitConditionExpression,
  clampWaitMs,
} from './wait-condition-script.js';

/**
 * The wait script decides whether to keep waiting, so it is run for real (`vm`) against a page whose
 * state changes on a timer — a compile check could not tell a working poller from one that resolves
 * immediately, which is precisely the bug that would make every wait useless.
 */

interface FakeState {
  text: string;
  selectorHits: () => unknown;
}

function run(
  kind: 'text' | 'selector',
  value: string,
  timeoutMs: number,
  state: FakeState,
): Promise<{ satisfied: boolean; waitedMs: number }> {
  const context = vm.createContext({
    document: {
      get body() {
        return { innerText: state.text };
      },
      querySelector: () => state.selectorHits(),
    },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    Date,
  });
  return vm.runInContext(buildWaitConditionExpression(kind, value, timeoutMs), context) as Promise<{
    satisfied: boolean;
    waitedMs: number;
  }>;
}

const noMatch: FakeState['selectorHits'] = () => null;
const visible = { checkVisibility: () => true };

describe('clampWaitMs', () => {
  it('keeps a sensible timeout and bounds an absurd one at both ends', () => {
    expect(clampWaitMs(3_000)).toBe(3_000);
    expect(clampWaitMs(1)).toBe(MIN_WAIT_MS);
    expect(clampWaitMs(10_000_000)).toBe(MAX_WAIT_MS);
    expect(clampWaitMs(undefined)).toBe(5_000);
    expect(clampWaitMs(Number.NaN)).toBe(5_000);
  });
});

describe('waiting for a condition', () => {
  it('resolves immediately when the condition already holds', async () => {
    const result = await run('text', 'Order placed', 5_000, {
      text: 'Order placed',
      selectorHits: noMatch,
    });
    expect(result.satisfied).toBe(true);
    expect(result.waitedMs).toBe(0);
  });

  it('keeps waiting until the text arrives, then reports how long it took', async () => {
    const state: FakeState = { text: 'Placing…', selectorHits: noMatch };
    setTimeout(() => {
      state.text = 'Order placed';
    }, 250);
    const result = await run('text', 'Order placed', 5_000, state);
    expect(result.satisfied).toBe(true);
    expect(result.waitedMs).toBeGreaterThan(0);
  });

  it('gives up at the timeout and says so, instead of hanging or throwing', async () => {
    const result = await run('text', 'Never appears', 300, {
      text: 'nothing',
      selectorHits: noMatch,
    });
    expect(result.satisfied).toBe(false);
    expect(result.waitedMs).toBeGreaterThanOrEqual(300);
  });

  it('requires a selector match to be RENDERED, not merely present', async () => {
    const hidden = { checkVisibility: () => false };
    const result = await run('selector', '#done', 300, { text: '', selectorHits: () => hidden });
    expect(result.satisfied).toBe(false);
  });

  it('accepts a rendered selector match', async () => {
    const result = await run('selector', '#done', 5_000, { text: '', selectorHits: () => visible });
    expect(result.satisfied).toBe(true);
  });

  it('fails fast on a malformed selector rather than burning the whole budget', async () => {
    const started = Date.now();
    const result = await run('selector', ':::', 5_000, {
      text: '',
      selectorHits: () => {
        throw new Error('bad selector');
      },
    });
    expect(result.satisfied).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
