import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOST_CONNECTION_CEILING,
  DEFAULT_START_CONNECTIONS,
  classifyParallelism,
  planConnectionCount,
} from './connection-count';
import { MAX_DOWNLOAD_SEGMENTS } from './download-segments';

describe('planConnectionCount', () => {
  it('starts a fresh host at the conservative default', () => {
    expect(planConnectionCount({ previous: null })).toEqual({
      count: DEFAULT_START_CONNECTIONS,
      reason: 'first-transfer',
    });
  });

  it('never starts above the host ceiling, even the default one', () => {
    expect(planConnectionCount({ previous: null, hostCeiling: 2 }).count).toBe(2);
  });

  it('treats a previous count with no verdict as still the first real measurement', () => {
    // The transfer happened but produced no usable throughput signal — do not guess an adjustment.
    expect(planConnectionCount({ previous: 6, observed: undefined }).reason).toBe('first-transfer');
  });

  it('steps up by one when the extra connections scaled', () => {
    expect(planConnectionCount({ previous: 4, observed: 'scaled', hostCeiling: 8 })).toEqual({
      count: 5,
      reason: 'scaled-up',
    });
  });

  it('holds at the ceiling rather than reporting a phantom step', () => {
    expect(planConnectionCount({ previous: 8, observed: 'scaled', hostCeiling: 8 })).toEqual({
      count: 8,
      reason: 'held-at-ceiling',
    });
  });

  it('drifts down by one on a flat verdict — unhelpful connections are not free to the host', () => {
    expect(planConnectionCount({ previous: 6, observed: 'flat', hostCeiling: 8 })).toEqual({
      count: 5,
      reason: 'held-flat',
    });
  });

  it('halves on a penalized verdict — overshooting risks refused connections', () => {
    expect(planConnectionCount({ previous: 8, observed: 'penalized', hostCeiling: 8 })).toEqual({
      count: 4,
      reason: 'backed-off',
    });
  });

  it('bottoms out at a single stream, never zero', () => {
    expect(planConnectionCount({ previous: 1, observed: 'penalized' })).toEqual({
      count: 1,
      reason: 'floor',
    });
    expect(planConnectionCount({ previous: 1, observed: 'flat' })).toEqual({
      count: 1,
      reason: 'floor',
    });
  });

  it('re-clamps a stored ceiling from an older build to the hard cap', () => {
    // A persisted override of 50 cannot lift MAX_DOWNLOAD_SEGMENTS.
    const plan = planConnectionCount({ previous: MAX_DOWNLOAD_SEGMENTS, observed: 'scaled', hostCeiling: 50 });
    expect(plan.count).toBe(MAX_DOWNLOAD_SEGMENTS);
    expect(plan.reason).toBe('held-at-ceiling');
  });

  it('respects a lowered ceiling immediately, even mid-climb', () => {
    // The user dropped this host to 3 while the last transfer ran at 6.
    expect(planConnectionCount({ previous: 6, observed: 'scaled', hostCeiling: 3 }).count).toBe(3);
  });

  it('default ceiling applies when none is supplied', () => {
    expect(planConnectionCount({ previous: 4, observed: 'scaled' }).count).toBe(
      DEFAULT_HOST_CONNECTION_CEILING,
    );
  });
});

describe('classifyParallelism', () => {
  it('is penalized when the host signalled overload, whatever the throughput', () => {
    expect(
      classifyParallelism({
        previousCount: 2,
        previousAggregateMbps: 5,
        newCount: 4,
        newAggregateMbps: 20,
        hostSignalledOverload: true,
      }),
    ).toBe('penalized');
  });

  it('is penalized when more connections made the whole transfer slower', () => {
    expect(
      classifyParallelism({
        previousCount: 2,
        previousAggregateMbps: 10,
        newCount: 4,
        newAggregateMbps: 7,
      }),
    ).toBe('penalized');
  });

  it('is scaled when doubling connections captured most of the linear speed-up', () => {
    // 2 -> 4 connections, 10 -> 18 Mbps: captured (1.8-1)/(2-1) = 0.8 of ideal.
    expect(
      classifyParallelism({
        previousCount: 2,
        previousAggregateMbps: 10,
        newCount: 4,
        newAggregateMbps: 18,
      }),
    ).toBe('scaled');
  });

  it('is flat when more connections barely moved the needle', () => {
    // 2 -> 4 connections, 10 -> 11 Mbps: captured 0.05 of ideal.
    expect(
      classifyParallelism({
        previousCount: 2,
        previousAggregateMbps: 10,
        newCount: 4,
        newAggregateMbps: 11,
      }),
    ).toBe('flat');
  });

  it('treats a non-increasing count as flat when throughput held', () => {
    expect(
      classifyParallelism({
        previousCount: 4,
        previousAggregateMbps: 10,
        newCount: 4,
        newAggregateMbps: 10,
      }),
    ).toBe('flat');
  });

  it('guards against a zero or missing baseline rather than dividing by it', () => {
    expect(
      classifyParallelism({
        previousCount: 1,
        previousAggregateMbps: 0,
        newCount: 4,
        newAggregateMbps: 12,
      }),
    ).toBe('flat');
  });
});
