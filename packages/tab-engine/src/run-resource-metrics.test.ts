import { describe, expect, it } from 'vitest';
import {
  cpuSecondsDelta,
  emptyRunResourceAccumulator,
  foldRunResourceSample,
  type CpuTimeMicros,
  type RunResourceSample,
} from './run-resource-metrics';

const sample = (pids: number[], metrics: [number, number][]): RunResourceSample => ({
  pids,
  metrics: metrics.map(([pid, workingSetKb]) => ({ pid, workingSetKb })),
});

describe('foldRunResourceSample', () => {
  it('reports zero peak for a run with zero samples', () => {
    const acc = emptyRunResourceAccumulator();
    expect(acc.peakRssBytes).toBe(0);
    expect(acc.sampleCount).toBe(0);
  });

  it('attributes the SUM of the given pids at one sample', () => {
    const acc = foldRunResourceSample(
      emptyRunResourceAccumulator(),
      sample([100, 200], [[100, 50_000], [200, 30_000]]),
    );
    expect(acc.peakRssBytes).toBe((50_000 + 30_000) * 1024);
    expect(acc.sampleCount).toBe(1);
  });

  it('keeps the running PEAK, not the latest sample', () => {
    let acc = emptyRunResourceAccumulator();
    acc = foldRunResourceSample(acc, sample([100], [[100, 80_000]]));
    acc = foldRunResourceSample(acc, sample([100], [[100, 20_000]])); // memory went DOWN
    expect(acc.peakRssBytes).toBe(80_000 * 1024);
    expect(acc.sampleCount).toBe(2);
  });

  it('keeps the peak even when a LATER sample is larger', () => {
    let acc = emptyRunResourceAccumulator();
    acc = foldRunResourceSample(acc, sample([100], [[100, 20_000]]));
    acc = foldRunResourceSample(acc, sample([100], [[100, 90_000]]));
    expect(acc.peakRssBytes).toBe(90_000 * 1024);
  });

  it('contributes 0 for a pid missing from the metrics snapshot, without throwing', () => {
    const acc = foldRunResourceSample(
      emptyRunResourceAccumulator(),
      sample([100, 999], [[100, 40_000]]), // pid 999 not present (process gone / never resolved)
    );
    expect(acc.peakRssBytes).toBe(40_000 * 1024);
  });

  it('attributes a NEW pid once the run switches tabs mid-run', () => {
    // Sample 1: run's working tab is pid 100 (small). Sample 2: the run followed a navigation to a new
    // tab, pid 200 (large) — pid 100 no longer appears in the pids list for that sample.
    let acc = emptyRunResourceAccumulator();
    acc = foldRunResourceSample(acc, sample([1, 100], [[1, 10_000], [100, 15_000]]));
    acc = foldRunResourceSample(acc, sample([1, 200], [[1, 10_000], [200, 60_000]]));
    expect(acc.peakRssBytes).toBe((10_000 + 60_000) * 1024);
    expect(acc.sampleCount).toBe(2);
  });

  it('a sample with no matching pids at all contributes zero, not a throw', () => {
    const acc = foldRunResourceSample(emptyRunResourceAccumulator(), sample([1, 2], []));
    expect(acc.peakRssBytes).toBe(0);
    expect(acc.sampleCount).toBe(1);
  });
});

describe('cpuSecondsDelta', () => {
  const cpu = (userCPUTime: number, systemCPUTime: number): CpuTimeMicros => ({
    userCPUTime,
    systemCPUTime,
  });

  it('converts a user+system microsecond delta to seconds', () => {
    expect(cpuSecondsDelta(cpu(0, 0), cpu(1_500_000, 500_000))).toBe(2);
  });

  it('is zero for two identical snapshots', () => {
    expect(cpuSecondsDelta(cpu(1_000, 500), cpu(1_000, 500))).toBe(0);
  });

  it('clamps to zero rather than going negative', () => {
    expect(cpuSecondsDelta(cpu(2_000_000, 0), cpu(1_000_000, 0))).toBe(0);
  });
});
