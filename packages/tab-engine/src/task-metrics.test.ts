import { describe, expect, it } from 'vitest';
import {
  taskManagerRows,
  totalMemoryMb,
  type ProcessMetric,
  type TabProcess,
} from './task-metrics';

const metric = (pid: number, cpu: number, kb: number): ProcessMetric => ({
  pid,
  cpuPercent: cpu,
  workingSetKb: kb,
  type: 'Tab',
});

const tab = (over: Partial<TabProcess> = {}): TabProcess => ({
  tabId: 't1',
  title: 'Example',
  url: 'https://example.com/',
  pid: 100,
  ...over,
});

describe('mapping processes onto tabs', () => {
  it('reports CPU and memory for a tab with a process of its own', () => {
    const [row] = taskManagerRows([tab()], [metric(100, 12.34, 204_800)]);
    expect(row?.cpuPercent).toBe(12.3);
    expect(row?.memoryMb).toBe(200);
    expect(row?.shared).toBe(false);
  });

  it('FLAGS a shared process instead of inventing a per-tab share', () => {
    // Chromium groups same-site tabs into one renderer. Attributing the whole 400 MB to each of them
    // would be four wrong numbers, and dividing it would be four different wrong numbers.
    const rows = taskManagerRows(
      [tab({ tabId: 'a' }), tab({ tabId: 'b' })],
      [metric(100, 20, 409_600)],
    );
    expect(rows.every((r) => r.shared)).toBe(true);
    expect(rows.every((r) => r.tabsInProcess === 2)).toBe(true);
    expect(rows[0]?.memoryMb).toBe(400); // the PROCESS total, flagged as shared
  });

  it('does not double-count a shared process in the total', () => {
    const rows = taskManagerRows(
      [tab({ tabId: 'a' }), tab({ tabId: 'b' })],
      [metric(100, 20, 409_600)],
    );
    expect(totalMemoryMb(rows)).toBe(400);
  });

  it('sums DISTINCT processes in the total', () => {
    const rows = taskManagerRows(
      [tab({ tabId: 'a', pid: 100 }), tab({ tabId: 'b', pid: 200 })],
      [metric(100, 5, 102_400), metric(200, 5, 102_400)],
    );
    expect(totalMemoryMb(rows)).toBe(200);
  });
});

describe('what cannot be measured', () => {
  it('reports NULL, not zero, when a tab’s process is not in the metrics', () => {
    // Zero is a measurement. "We could not see it" is not, and printing the second as the first is how
    // a diagnostic tool starts lying about the thing it exists to show.
    const [row] = taskManagerRows([tab()], []);
    expect(row?.cpuPercent).toBeNull();
    expect(row?.memoryMb).toBeNull();
  });

  it('still lists a DISCARDED tab, with no figures and no process', () => {
    // A slept tab is a row the user needs to see — it is why their memory went down.
    const [row] = taskManagerRows([tab({ discarded: true })], [metric(100, 50, 999_999)]);
    expect(row?.discarded).toBe(true);
    expect(row?.pid).toBeNull();
    expect(row?.memoryMb).toBeNull();
  });

  it('does not count a discarded tab towards process sharing', () => {
    const rows = taskManagerRows(
      [tab({ tabId: 'a' }), tab({ tabId: 'b', discarded: true })],
      [metric(100, 5, 102_400)],
    );
    expect(rows[0]?.shared).toBe(false);
    expect(rows[0]?.tabsInProcess).toBe(1);
  });

  it('excludes unmeasurable rows from the total rather than treating them as zero', () => {
    const rows = taskManagerRows(
      [tab({ tabId: 'a' }), tab({ tabId: 'b', pid: 200 })],
      [metric(100, 5, 102_400)],
    );
    expect(totalMemoryMb(rows)).toBe(100);
  });
});
