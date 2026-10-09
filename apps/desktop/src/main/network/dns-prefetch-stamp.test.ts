import { describe, expect, it } from 'vitest';
import { dnsPrefetchStamp } from './dns-prefetch-stamp';

describe('dnsPrefetchStamp', () => {
  it('always suppresses prefetch inside a tunnel, whatever the preference says', () => {
    for (const pref of [true, false, undefined]) {
      expect(dnsPrefetchStamp(true, pref)).toEqual({ 'X-DNS-Prefetch-Control': 'off' });
    }
  });

  it('leaves a Direct session alone by default and when the preference is on', () => {
    expect(dnsPrefetchStamp(false, true)).toEqual({});
    expect(dnsPrefetchStamp(false, undefined)).toEqual({});
  });

  it('suppresses prefetch on a Direct session only when the user turned it off', () => {
    expect(dnsPrefetchStamp(false, false)).toEqual({ 'X-DNS-Prefetch-Control': 'off' });
  });

  it('hands out a fresh object each time, so a caller cannot poison the shared constant', () => {
    const a = dnsPrefetchStamp(true, true);
    a['X-DNS-Prefetch-Control'] = 'on';
    expect(dnsPrefetchStamp(true, true)).toEqual({ 'X-DNS-Prefetch-Control': 'off' });
  });
});
