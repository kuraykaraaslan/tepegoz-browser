import { describe, expect, it, vi } from 'vitest';

vi.mock('./tabs', () => ({ default: { all: () => [] } }));

const { mapAppMetrics } = await import('./process-metrics.electron');

const cpu = (percentCPUUsage: number) => ({ percentCPUUsage });
const mem = (workingSetSize: number) => ({ workingSetSize });

describe('mapAppMetrics', () => {
  it('names a renderer by the tab it hosts and carries the tab id', () => {
    const rows = mapAppMetrics(
      [{ pid: 42, type: 'Tab', cpu: cpu(5), memory: mem(1024) }],
      [{ tabId: 't-1', title: 'My Page', url: 'https://ex.com/', discarded: false, pid: 42 }],
    );
    expect(rows).toEqual([
      {
        pid: 42,
        kind: 'tab',
        label: 'My Page',
        cpuPercent: 5,
        memoryBytes: 1024 * 1024,
        tabId: 't-1',
        discarded: false,
      },
    ]);
  });

  it('falls back to the host when a tab has no title yet', () => {
    const [row] = mapAppMetrics(
      [{ pid: 7, type: 'Tab', cpu: cpu(0), memory: mem(0) }],
      [{ tabId: 't', title: '   ', url: 'https://sub.example.org/x', discarded: false, pid: 7 }],
    );
    expect(row?.label).toBe('sub.example.org');
  });

  it('classifies browser / GPU / utility infrastructure processes', () => {
    const rows = mapAppMetrics(
      [
        { pid: 1, type: 'Browser', cpu: cpu(2), memory: mem(500) },
        { pid: 2, type: 'GPU', cpu: cpu(1), memory: mem(300) },
        { pid: 3, type: 'Utility', cpu: cpu(0), memory: mem(100), name: 'Network Service' },
      ],
      [],
    );
    expect(rows.map((r) => [r.kind, r.label])).toEqual([
      ['browser', 'Browser'],
      ['gpu', 'GPU'],
      ['utility', 'Network Service'],
    ]);
  });

  it('rounds CPU to one decimal and converts working-set KiB → bytes', () => {
    const [row] = mapAppMetrics([{ pid: 9, type: 'Browser', cpu: cpu(3.456), memory: mem(2048) }], []);
    expect(row?.cpuPercent).toBe(3.5);
    expect(row?.memoryBytes).toBe(2048 * 1024);
  });

  it('adds a discarded tab as a zero row with pid 0, after the real processes', () => {
    const rows = mapAppMetrics(
      [{ pid: 1, type: 'Browser', cpu: cpu(0), memory: mem(0) }],
      [
        { tabId: 'live', title: 'Live', url: 'https://a/', discarded: false, pid: null },
        { tabId: 'asleep', title: 'Asleep', url: 'https://b/', discarded: true, pid: null },
      ],
    );
    // The live tab has no metrics entry AND no pid → it produces no row; only the discarded one does.
    expect(rows.filter((r) => r.kind === 'tab')).toEqual([
      {
        pid: 0,
        kind: 'tab',
        label: 'Asleep',
        cpuPercent: 0,
        memoryBytes: 0,
        tabId: 'asleep',
        discarded: true,
      },
    ]);
  });
});
