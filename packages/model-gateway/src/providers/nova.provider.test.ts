import { describe, it, expect } from 'vitest';
import { toNovaParams } from './nova.provider';
import type { CanonRequest } from '../types';

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'nova',
    model: 'nova-2-lite-v1',
    capability: 'plan',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 1024,
    timeoutMs: 30000,
    ...over,
  };
}

describe('toNovaParams', () => {
  it('emits max_tokens (Nova), NOT OpenAI max_completion_tokens', () => {
    const params = toNovaParams(req({ maxTokens: 256 }));
    expect(params.max_tokens).toBe(256);
    expect('max_completion_tokens' in params).toBe(false);
  });

  it('keeps system messages inline (no top-level lift) and carries the model', () => {
    const params = toNovaParams(
      req({
        model: 'nova-micro-v1',
        messages: [
          { role: 'system', content: 'rule A' },
          { role: 'user', content: 'go' },
          { role: 'assistant', content: 'ok' },
        ],
      }),
    );
    expect(params.model).toBe('nova-micro-v1');
    expect(params.messages).toEqual([
      { role: 'system', content: 'rule A' },
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'ok' },
    ]);
  });

  it('sets json_object response_format only when responseFormat is json', () => {
    expect(toNovaParams(req()).response_format).toBeUndefined();
    expect(toNovaParams(req({ responseFormat: 'json' })).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('maps canon tools to OpenAI-compatible function tool definitions', () => {
    const params = toNovaParams(
      req({
        tools: [
          { name: 'browser_get_page', description: 'read page', inputSchema: { type: 'object' } },
        ],
      }),
    );
    expect(params.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'browser_get_page',
          description: 'read page',
          parameters: { type: 'object' },
        },
      },
    ]);
  });

  it('omits tools when none are provided', () => {
    expect(toNovaParams(req()).tools).toBeUndefined();
  });
});
