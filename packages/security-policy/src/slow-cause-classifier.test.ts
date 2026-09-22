import { describe, expect, it } from 'vitest';
import { classifySlowCause, type SlowCauseSignals } from './slow-cause-classifier';

/**
 * Pure attribution: given the connection pool's already-tallied signals, which of the closed
 * {@link import('@tepegoz/shared-types').SlowCause} set explains a tunnelled tab feeling slow. No I/O, no
 * clock — every test supplies exact deltas, which is the point of keeping this function pure.
 */

function signals(over: Partial<SlowCauseSignals> = {}): SlowCauseSignals {
  return {
    status: 'up',
    msSinceLastHealthCheck: 5_000,
    drops: 0,
    reconnects: 0,
    recentExitStatusClass: null,
    ...over,
  };
}

describe('classifySlowCause', () => {
  it('a fully down connection is always tunnel_degraded, never a softer cause', () => {
    expect(classifySlowCause(signals({ status: 'down' }))).toBe('tunnel_degraded');
    // Even with an otherwise "clean" exit signal — down is down.
    expect(
      classifySlowCause(signals({ status: 'down', recentExitStatusClass: '2xx' })),
    ).toBe('tunnel_degraded');
  });

  it('a connection still establishing is bridge_or_bootstrap', () => {
    expect(classifySlowCause(signals({ status: 'connecting' }))).toBe('bridge_or_bootstrap');
  });

  it('a healthy, current, quiet connection is relay_latency — the honest leftover explanation', () => {
    expect(classifySlowCause(signals())).toBe('relay_latency');
  });

  it('a 2xx/3xx exit response on a healthy connection is still relay_latency, not a false "blocked" claim', () => {
    expect(classifySlowCause(signals({ recentExitStatusClass: '2xx' }))).toBe('relay_latency');
    expect(classifySlowCause(signals({ recentExitStatusClass: '3xx' }))).toBe('relay_latency');
  });

  it('a 4xx exit response on an otherwise healthy connection is exit_blocked_by_site', () => {
    expect(classifySlowCause(signals({ recentExitStatusClass: '4xx' }))).toBe('exit_blocked_by_site');
  });

  it('a 5xx exit response is NOT attributed to the tunnel — that would be false confidence', () => {
    expect(classifySlowCause(signals({ recentExitStatusClass: '5xx' }))).toBe('insufficient_signal');
  });

  it('never checked (no health poll yet) is insufficient_signal, not assumed healthy or degraded', () => {
    expect(classifySlowCause(signals({ msSinceLastHealthCheck: null }))).toBe('insufficient_signal');
  });

  it('a health poll gone stale on a nominally-up connection is tunnel_degraded', () => {
    expect(classifySlowCause(signals({ msSinceLastHealthCheck: 46_000 }))).toBe('tunnel_degraded');
    // Just under the threshold is still read as current, not stale.
    expect(classifySlowCause(signals({ msSinceLastHealthCheck: 44_999 }))).toBe('relay_latency');
  });

  it.each([
    ['drops', { drops: 2 }],
    ['reconnects', { reconnects: 2 }],
  ])('flapping this session (>=2 %s) is tunnel_degraded even while nominally up', (_label, over) => {
    expect(classifySlowCause(signals(over))).toBe('tunnel_degraded');
  });

  it('a single recovered drop is not yet "flapping" — one reconnect is not a pattern', () => {
    expect(classifySlowCause(signals({ drops: 1, reconnects: 1 }))).toBe('relay_latency');
  });

  describe('boundary case: simultaneously slow AND unhealthy — tunnel_degraded wins', () => {
    it('flapping + a clean 4xx-shaped exit signal still reports the tunnel fault, not the site', () => {
      // If this reported exit_blocked_by_site, a user watching their own tunnel flap would be told to
      // blame the website instead of the connection that is actually failing.
      expect(
        classifySlowCause(signals({ drops: 3, recentExitStatusClass: '4xx' })),
      ).toBe('tunnel_degraded');
    });

    it('a stale health poll + a clean exit signal still reports the tunnel fault, not relay latency', () => {
      expect(
        classifySlowCause(
          signals({ msSinceLastHealthCheck: 60_000, recentExitStatusClass: '2xx' }),
        ),
      ).toBe('tunnel_degraded');
    });

    it('down + flapping counters + a 4xx exit signal is still just tunnel_degraded (down wins outright)', () => {
      expect(
        classifySlowCause(
          signals({ status: 'down', drops: 5, reconnects: 5, recentExitStatusClass: '4xx' }),
        ),
      ).toBe('tunnel_degraded');
    });
  });

  it('always returns exactly one of the closed SlowCause members for every branch exercised above', () => {
    const causes = new Set([
      classifySlowCause(signals({ status: 'down' })),
      classifySlowCause(signals({ status: 'connecting' })),
      classifySlowCause(signals()),
      classifySlowCause(signals({ recentExitStatusClass: '4xx' })),
      classifySlowCause(signals({ recentExitStatusClass: '5xx' })),
      classifySlowCause(signals({ msSinceLastHealthCheck: null })),
      classifySlowCause(signals({ msSinceLastHealthCheck: 46_000 })),
      classifySlowCause(signals({ drops: 2 })),
    ]);
    expect(causes).toEqual(
      new Set([
        'tunnel_degraded',
        'bridge_or_bootstrap',
        'relay_latency',
        'exit_blocked_by_site',
        'insufficient_signal',
      ]),
    );
  });
});
