import { describe, it, expect } from 'vitest';
import type { CanonRequest } from '@tepegoz/model-gateway';
import { grammarFor, toLocalTurns } from './map-request';
import { fromLocalResult } from './map-response';
import { jsonObjectGrammar } from './json-grammar';

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'local',
    model: 'local-slm',
    capability: 'exec',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 256,
    timeoutMs: 30000,
    ...over,
  };
}

describe('toLocalTurns / grammarFor', () => {
  it('passes turns through unchanged', () => {
    const r = req({ messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }] });
    expect(toLocalTurns(r)).toBe(r.messages);
  });

  it('returns a grammar only for responseFormat json', () => {
    expect(grammarFor(req())).toBeUndefined();
    expect(grammarFor(req({ responseFormat: 'json' }))).toBe(jsonObjectGrammar());
  });

  it('produces a non-empty object-rooted grammar', () => {
    expect(jsonObjectGrammar()).toMatch(/root\s+::= object/);
  });
});

describe('fromLocalResult', () => {
  it('maps finish reasons to the canon contract', () => {
    expect(fromLocalResult({ text: 'a', finish: 'stop', inputTokens: 1, outputTokens: 2 }).stopReason).toBe('end');
    expect(fromLocalResult({ text: 'a', finish: 'length', inputTokens: 1, outputTokens: 2 }).stopReason).toBe('max_tokens');
    expect(fromLocalResult({ text: '', finish: 'abort', inputTokens: 1, outputTokens: 0 }).stopReason).toBe('error');
  });

  it('carries text + usage and never emits tool calls', () => {
    const res = fromLocalResult({ text: 'hello', finish: 'stop', inputTokens: 5, outputTokens: 3 });
    expect(res.text).toBe('hello');
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 3 });
    expect(res.toolCalls).toEqual([]);
  });
});
