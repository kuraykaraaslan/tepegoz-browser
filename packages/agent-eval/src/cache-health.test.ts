import { describe, it, expect } from 'vitest';
import { HEALTHY_READ_RATIO, cacheHealth, cacheHealthLine } from './cache-health';

function usage(cacheReadTokens: number, cacheWriteTokens: number) {
  return {
    inputTokens: 100,
    outputTokens: 10,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: 110 + cacheReadTokens + cacheWriteTokens,
  };
}

describe('cacheHealth', () => {
  it('reports "not used" when nothing was cached — absence is not a failure', () => {
    expect(cacheHealth(usage(0, 0)).verdict).toBe('not-used');
  });

  /** The failure this whole feature exists to make visible. */
  it('reports "wasted" when the cache was written and never read', () => {
    const health = cacheHealth(usage(0, 5000));
    expect(health.verdict).toBe('wasted');
    expect(health.readRatio).toBe(0);
  });

  it('reports "weak" when writes outweigh reads', () => {
    expect(cacheHealth(usage(1000, 9000)).verdict).toBe('weak');
  });

  it('reports "healthy" for a normal agent loop, which re-reads its prefix every step', () => {
    const health = cacheHealth(usage(90_000, 5000));
    expect(health.verdict).toBe('healthy');
    expect(health.readRatio).toBeGreaterThan(HEALTHY_READ_RATIO);
  });

  it('places the boundary exactly at the bar', () => {
    expect(cacheHealth(usage(50, 50)).verdict).toBe('healthy');
    expect(cacheHealth(usage(49, 51)).verdict).toBe('weak');
  });
});

describe('cacheHealthLine', () => {
  it('says out loud that a wasted cache costs more than none', () => {
    const line = cacheHealthLine(cacheHealth(usage(0, 5000)));
    expect(line).toContain('WASTED');
    expect(line).toMatch(/costs MORE/);
  });

  it('reports counts for a healthy cache', () => {
    const line = cacheHealthLine(cacheHealth(usage(90_000, 5000)));
    expect(line).toContain('healthy');
    expect(line).toContain('90,000 read');
  });

  it('does not cry failure when caching simply was not used', () => {
    const line = cacheHealthLine(cacheHealth(usage(0, 0)));
    expect(line).toContain('not used');
    expect(line).not.toContain('WASTED');
  });
});
