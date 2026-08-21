import { describe, it, expect } from 'vitest';
import {
  MIN_CACHEABLE_CHARS,
  cacheEffect,
  contentChars,
  stableMessageIndex,
  ttlOf,
  worthCaching,
} from './cache-plan';

describe('contentChars', () => {
  it('sizes a plain string turn', () => {
    expect(contentChars('hello')).toBe(5);
  });

  it('sums every text-bearing field of a block turn', () => {
    const chars = contentChars([
      { type: 'text', text: 'abcd' },
      { type: 'tool_result', toolUseId: 'x', content: 'efg' },
    ]);
    expect(chars).toBe(7);
  });

  it('counts an image payload — it is exactly what a cached prefix has to re-send', () => {
    expect(contentChars([{ type: 'image', mediaType: 'image/png', data: 'AAAA' }])).toBe(4);
  });
});

describe('stableMessageIndex', () => {
  it('reads a valid index', () => {
    expect(stableMessageIndex({ lastStableMessageIndex: 3 })).toBe(3);
    expect(stableMessageIndex({ lastStableMessageIndex: 0 })).toBe(0);
  });

  it('treats absent, negative, and non-integer as "nothing is stable yet"', () => {
    expect(stableMessageIndex(undefined)).toBeNull();
    expect(stableMessageIndex({})).toBeNull();
    expect(stableMessageIndex({ lastStableMessageIndex: -1 })).toBeNull();
    expect(stableMessageIndex({ lastStableMessageIndex: 1.5 })).toBeNull();
  });
});

describe('worthCaching', () => {
  it('refuses a prefix below the vendor minimum — marking it buys nothing', () => {
    expect(worthCaching(MIN_CACHEABLE_CHARS - 1)).toBe(false);
    expect(worthCaching(0)).toBe(false);
  });

  it('accepts a prefix at or above the minimum', () => {
    expect(worthCaching(MIN_CACHEABLE_CHARS)).toBe(true);
  });
});

describe('ttlOf', () => {
  it('defaults to the vendor default rather than inventing a long-lived cache', () => {
    expect(ttlOf(undefined)).toBe('5m');
    expect(ttlOf({})).toBe('5m');
  });

  it('honours a pinned ttl', () => {
    expect(ttlOf({ ttl: '1h' })).toBe('1h');
  });
});

describe('cacheEffect', () => {
  it('reports nothing requested when there is no hint', () => {
    const effect = cacheEffect(undefined, { inputTokens: 10, outputTokens: 2 });
    expect(effect.requested).toBe(false);
    expect(effect.wasted).toBe(false);
  });

  it('flags a write that read nothing back — the silent-invalidator signature', () => {
    const effect = cacheEffect(
      { systemAndTools: true },
      { inputTokens: 100, outputTokens: 5, cacheWriteTokens: 900, cacheReadTokens: 0 },
    );
    expect(effect.requested).toBe(true);
    expect(effect.wasted).toBe(true);
    expect(effect.writeTokens).toBe(900);
  });

  it('does not flag a healthy hit', () => {
    const effect = cacheEffect(
      { systemAndTools: true },
      { inputTokens: 100, outputTokens: 5, cacheWriteTokens: 0, cacheReadTokens: 900 },
    );
    expect(effect.wasted).toBe(false);
    expect(effect.readTokens).toBe(900);
  });

  it('does not flag a call that simply never cached anything', () => {
    const effect = cacheEffect({ systemAndTools: true }, { inputTokens: 100, outputTokens: 5 });
    expect(effect.wasted).toBe(false);
  });
});
