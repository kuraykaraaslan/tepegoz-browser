import { describe, it, expect } from 'vitest';
import { stableIndexBefore } from './cache-window';

describe('stableIndexBefore', () => {
  it('claims nothing while neither collapsible message exists yet', () => {
    expect(stableIndexBefore(null, null)).toBeNull();
  });

  it('stops one short of the only live index', () => {
    expect(stableIndexBefore(5, null)).toBe(4);
    expect(stableIndexBefore(null, 7)).toBe(6);
  });

  it('stops one short of the EARLIER of the two live indices', () => {
    // A breakpoint between them would still sit before a message that gets rewritten.
    expect(stableIndexBefore(9, 4)).toBe(3);
    expect(stableIndexBefore(4, 9)).toBe(3);
  });

  it('claims nothing when the live message is the very first one', () => {
    expect(stableIndexBefore(0, null)).toBeNull();
    expect(stableIndexBefore(0, 3)).toBeNull();
  });
});

/**
 * The property that actually matters: replay the Reactor's collapse pattern and assert the breakpoint
 * NEVER lands on an index a later step rewrites. A unit test of the arithmetic alone would pass even if
 * the rule were off by one in the direction that silently costs money.
 */
describe('stableIndexBefore under the Reactor mutation pattern', () => {
  it('never marks an index that a later step rewrites', () => {
    const rewritten = new Set<number>();
    const promised: number[] = [];
    let messageCount = 2; // the system + goal turns the run opens with
    let lastStateIndex: number | null = null;
    let workingStateIndex: number | null = null;

    for (let step = 0; step < 12; step += 1) {
      // pushObservation: collapse the previous page-state IN PLACE, then append the new one.
      if (lastStateIndex !== null) rewritten.add(lastStateIndex);
      lastStateIndex = messageCount;
      messageCount += 1;

      // syncWorkingState: same collapse-then-append for the typed ledger.
      if (workingStateIndex !== null) rewritten.add(workingStateIndex);
      workingStateIndex = messageCount;
      messageCount += 1;

      // The assistant's decision turn — appended, never rewritten.
      messageCount += 1;

      const stable = stableIndexBefore(lastStateIndex, workingStateIndex);
      if (stable !== null) promised.push(stable);
    }

    expect(promised.length).toBeGreaterThan(0);
    for (const index of promised) {
      expect(rewritten.has(index)).toBe(false);
    }
  });

  it('still promises a usable prefix — the guard is not vacuously safe', () => {
    // A rule that always returned null would pass the test above. The window must actually grow.
    const first = stableIndexBefore(2, 3);
    const later = stableIndexBefore(20, 21);
    expect(first).not.toBeNull();
    expect(later).not.toBeNull();
    expect(later as number).toBeGreaterThan(first as number);
  });
});
