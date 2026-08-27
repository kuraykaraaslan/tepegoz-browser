import { describe, expect, it } from 'vitest';
import type { ProcessRow } from '@tepegoz/desktop-ipc';
import { formatBytes, formatCpu, sortRows, totals } from './process-page-helpers';

function row(over: Partial<ProcessRow>): ProcessRow {
  return {
    pid: 1,
    kind: 'utility',
    label: 'x',
    cpuPercent: 0,
    memoryBytes: 0,
    ...over,
  };
}

describe('formatBytes', () => {
  it('scales through B / KB / MB / GB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2 * 1024)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GB');
  });
});

describe('formatCpu', () => {
  it('is one decimal and clamps negatives', () => {
    expect(formatCpu(12.34)).toBe('12.3%');
    expect(formatCpu(-1)).toBe('0.0%');
  });
});

describe('sortRows', () => {
  it('orders browser → gpu → utility → tabs, heaviest first, sleeping tabs last', () => {
    const input: ProcessRow[] = [
      row({ pid: 10, kind: 'tab', label: 'B tab', memoryBytes: 100 }),
      row({ pid: 0, kind: 'tab', label: 'Sleeper', memoryBytes: 0, discarded: true }),
      row({ pid: 2, kind: 'gpu', label: 'GPU', memoryBytes: 50 }),
      row({ pid: 1, kind: 'browser', label: 'Browser', memoryBytes: 999 }),
      row({ pid: 11, kind: 'tab', label: 'A tab', memoryBytes: 300 }),
      row({ pid: 3, kind: 'utility', label: 'Network', memoryBytes: 20 }),
    ];
    expect(sortRows(input).map((r) => r.label)).toEqual([
      'Browser',
      'GPU',
      'Network',
      'A tab',
      'B tab',
      'Sleeper',
    ]);
  });

  it('does not mutate its input', () => {
    const input = [row({ pid: 2, kind: 'gpu' }), row({ pid: 1, kind: 'browser' })];
    const before = input.map((r) => r.pid);
    sortRows(input);
    expect(input.map((r) => r.pid)).toEqual(before);
  });
});

describe('totals', () => {
  it('sums cpu and memory, ignoring negatives', () => {
    const t = totals([
      row({ cpuPercent: 10, memoryBytes: 100 }),
      row({ cpuPercent: 5, memoryBytes: 200 }),
      row({ cpuPercent: -3, memoryBytes: 0 }),
    ]);
    expect(t).toEqual({ cpuPercent: 15, memoryBytes: 300 });
  });
});
