import { describe, it, expect } from 'vitest';
import { MIN_CACHEABLE_CHARS } from '../cache-plan';
import type { CanonRequest } from '../types';
import { fromAnthropicResult, toAnthropicParams } from './anthropic.provider';

/** A payload comfortably over the vendor's minimum cacheable prefix. */
const BIG = 'x'.repeat(MIN_CACHEABLE_CHARS + 100);

function req(over: Partial<CanonRequest>): CanonRequest {
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    capability: 'exec',
    messages: [],
    maxTokens: 100,
    timeoutMs: 1000,
    ...over,
  };
}

/** `cache_control` on the block at `index`, or undefined. */
function markerAt(params: ReturnType<typeof toAnthropicParams>, index: number): unknown {
  const content = params.messages[index]?.content;
  if (typeof content === 'string' || content === undefined) return undefined;
  const last = content[content.length - 1];
  return last === undefined ? undefined : (last as { cache_control?: unknown }).cache_control;
}

describe('toAnthropicParams — prompt-cache breakpoints', () => {
  it('sets no marker at all when the request carries no hint', () => {
    const params = toAnthropicParams(
      req({ messages: [{ role: 'system', content: BIG }, { role: 'user', content: BIG }] }),
    );
    expect(typeof params.system).toBe('string');
    expect(markerAt(params, 0)).toBeUndefined();
  });

  it('caches the system prompt (which spans the tools rendered before it)', () => {
    const params = toAnthropicParams(
      req({
        messages: [{ role: 'system', content: BIG }, { role: 'user', content: 'hi' }],
        cache: { systemAndTools: true, ttl: '1h' },
      }),
    );
    expect(params.system).toEqual([
      { type: 'text', text: BIG, cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
  });

  it('leaves a small system prompt uncached — below the minimum it would not cache anyway', () => {
    const params = toAnthropicParams(
      req({ messages: [{ role: 'system', content: 'short' }], cache: { systemAndTools: true } }),
    );
    expect(params.system).toBe('short');
  });

  /**
   * The regression this whole feature turns on. System turns are lifted OUT of `messages`, so canonical
   * index N is not Anthropic index N. An off-by-one here puts the breakpoint on a turn the Reactor still
   * rewrites, which fails silently and costs the write premium on every call.
   */
  it('translates the canonical index past lifted system turns', () => {
    const params = toAnthropicParams(
      req({
        messages: [
          { role: 'system', content: 'sys one' }, // canon 0 — lifted out
          { role: 'system', content: 'sys two' }, // canon 1 — lifted out
          { role: 'user', content: BIG }, // canon 2 → anthropic 0
          { role: 'assistant', content: BIG }, // canon 3 → anthropic 1  ← the promise
          { role: 'user', content: 'volatile page state' }, // canon 4 → anthropic 2
        ],
        cache: { lastStableMessageIndex: 3, ttl: '1h' },
      }),
    );
    expect(params.messages).toHaveLength(3);
    expect(markerAt(params, 1)).toEqual({ type: 'ephemeral', ttl: '1h' });
    // The volatile suffix must stay unmarked, or the breakpoint moves every step.
    expect(markerAt(params, 2)).toBeUndefined();
    expect(markerAt(params, 0)).toBeUndefined();
  });

  it('widens a plain-string turn to a block so the marker has somewhere to live', () => {
    const params = toAnthropicParams(
      req({
        messages: [{ role: 'user', content: BIG }, { role: 'user', content: 'now' }],
        cache: { lastStableMessageIndex: 0 },
      }),
    );
    expect(params.messages[0]?.content).toEqual([
      { type: 'text', text: BIG, cache_control: { type: 'ephemeral', ttl: '5m' } },
    ]);
  });

  it('skips the message breakpoint when the promised prefix is too small to cache', () => {
    const params = toAnthropicParams(
      req({
        messages: [{ role: 'user', content: 'tiny' }, { role: 'user', content: 'now' }],
        cache: { lastStableMessageIndex: 0 },
      }),
    );
    expect(markerAt(params, 0)).toBeUndefined();
  });

  it('ignores an index that points past the end rather than throwing', () => {
    const params = toAnthropicParams(
      req({ messages: [{ role: 'user', content: BIG }], cache: { lastStableMessageIndex: 99 } }),
    );
    expect(params.messages).toHaveLength(1);
  });
});

describe('fromAnthropicResult — cache counters', () => {
  const base = { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' };

  it('carries the vendor cache counters through', () => {
    const res = fromAnthropicResult({
      ...base,
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 20,
      },
    });
    expect(res.usage.cacheReadTokens).toBe(800);
    expect(res.usage.cacheWriteTokens).toBe(20);
  });

  /**
   * Absent must stay absent. A zero read is the load-bearing "a cache was in play and nothing hit"
   * signal; manufacturing one from a null would report waste on every uncached call.
   */
  it('leaves the counters absent when the vendor did not report them', () => {
    const res = fromAnthropicResult({ ...base, usage: { input_tokens: 10, output_tokens: 4 } });
    expect(res.usage.cacheReadTokens).toBeUndefined();
    expect(res.usage.cacheWriteTokens).toBeUndefined();
  });

  it('treats an explicit null as absent, not as zero', () => {
    const res = fromAnthropicResult({
      ...base,
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
      },
    });
    expect(res.usage.cacheReadTokens).toBeUndefined();
  });

  it('keeps a real zero read, which is what a wasted write looks like', () => {
    const res = fromAnthropicResult({
      ...base,
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 900,
      },
    });
    expect(res.usage.cacheReadTokens).toBe(0);
    expect(res.usage.cacheWriteTokens).toBe(900);
  });
});
