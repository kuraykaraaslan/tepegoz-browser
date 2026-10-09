import { describe, expect, it } from 'vitest';
import { TabRecency } from './tab-recency';

const LIVE = ['a', 'b', 'c', 'd'];

function used(...ids: string[]): TabRecency {
  const r = new TabRecency();
  for (const id of ids) r.touch(id);
  return r;
}

describe('order', () => {
  it('lists the most recently used first, then tabs never touched in strip order', () => {
    expect(used('c', 'a').order(LIVE)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('ignores closed tabs and re-touching moves a tab to the front', () => {
    const r = used('a', 'b', 'c');
    r.touch('a');
    expect(r.order(['a', 'c'])).toEqual(['a', 'c']);
    r.forget('a');
    // Forgotten means unknown again: it falls back to strip order behind the tabs with history.
    expect(r.order(LIVE)).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('a cycle', () => {
  it('walks deeper into history on repeated presses instead of bouncing between two tabs', () => {
    const r = used('d', 'c', 'b', 'a'); // a is current, then b, c, d
    expect(r.step(LIVE, 'a', 1)).toBe('b');
    expect(r.step(LIVE, 'b', 1)).toBe('c');
    expect(r.step(LIVE, 'c', 1)).toBe('d');
    expect(r.step(LIVE, 'd', 1)).toBe('a'); // wraps
  });

  it('a single press toggles to the previous tab, and ending commits it as the most recent', () => {
    const r = used('b', 'a');
    expect(r.step(LIVE, 'a', 1)).toBe('b');
    expect(r.endCycle()).toBe('b');
    expect(r.order(LIVE)[0]).toBe('b');
    expect(r.cycling).toBe(false);
    // The next cycle goes back to a.
    expect(r.step(LIVE, 'b', 1)).toBe('a');
  });

  it('Shift steps backwards from the current tab', () => {
    const r = used('c', 'b', 'a');
    expect(r.step(LIVE, 'a', -1)).toBe('d');
  });

  it('does not reorder history mid-cycle, even if the model touches the tab it lands on', () => {
    const r = used('c', 'b', 'a');
    r.step(LIVE, 'a', 1);
    r.touch('b'); // the model activating the previewed tab
    expect(r.step(LIVE, 'b', 1)).toBe('c');
  });

  it('treats a never-touched active tab as the current one', () => {
    const r = new TabRecency();
    expect(r.step(LIVE, 'c', 1)).toBe('a');
  });

  it('goes nowhere with fewer than two switchable tabs', () => {
    expect(new TabRecency().step(['a'], 'a', 1)).toBeNull();
    expect(new TabRecency().step([], null, 1)).toBeNull();
    expect(new TabRecency().cycling).toBe(false);
  });

  it('survives the tab it is previewing (or one behind it) being closed mid-cycle', () => {
    const r = used('d', 'c', 'b', 'a');
    expect(r.step(LIVE, 'a', 1)).toBe('b');
    r.forget('b');
    expect(r.step(['a', 'c', 'd'], null, 1)).toBe('d');
    r.forget('d');
    r.forget('c');
    r.forget('a'); // everything gone: the cycle ends rather than dangling
    expect(r.cycling).toBe(false);
    expect(r.endCycle()).toBeNull();
  });

  it('ending with no cycle is a no-op', () => {
    expect(new TabRecency().endCycle()).toBeNull();
  });
});
