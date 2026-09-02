import { describe, it, expect } from 'vitest';
import {
  DeepSeekProvider,
  GroqProvider,
  XaiProvider,
  toOpenAICompatParams,
} from './openai-compat.provider';
import type { CanonRequest } from '../types';

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'deepseek',
    model: 'deepseek-chat',
    capability: 'plan',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 1024,
    timeoutMs: 30000,
    ...over,
  };
}

describe('toOpenAICompatParams', () => {
  it('emits max_tokens, NOT OpenAI max_completion_tokens', () => {
    const params = toOpenAICompatParams(req({ maxTokens: 256 }));
    expect(params.max_tokens).toBe(256);
    expect('max_completion_tokens' in params).toBe(false);
  });

  it('keeps system messages inline and carries the model', () => {
    const params = toOpenAICompatParams(
      req({
        model: 'grok-4',
        messages: [
          { role: 'system', content: 'rule A' },
          { role: 'user', content: 'go' },
        ],
      }),
    );
    expect(params.model).toBe('grok-4');
    expect(params.messages).toEqual([
      { role: 'system', content: 'rule A' },
      { role: 'user', content: 'go' },
    ]);
  });

  it('sets json_object response_format only when responseFormat is json', () => {
    expect(toOpenAICompatParams(req()).response_format).toBeUndefined();
    expect(toOpenAICompatParams(req({ responseFormat: 'json' })).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('maps canon tools to OpenAI-compatible function tool definitions, omits when none', () => {
    expect(toOpenAICompatParams(req()).tools).toBeUndefined();
    const params = toOpenAICompatParams(
      req({ tools: [{ name: 't', description: 'd', inputSchema: { type: 'object' } }] }),
    );
    expect(params.tools).toEqual([
      { type: 'function', function: { name: 't', description: 'd', parameters: { type: 'object' } } },
    ]);
  });
});

describe('OpenAI-compatible provider adapters', () => {
  it('carry the right id and are not on the native tool path', () => {
    const inject = { client: {} as never };
    expect(new DeepSeekProvider(inject).id).toBe('deepseek');
    expect(new XaiProvider(inject).id).toBe('xai');
    expect(new GroqProvider(inject).id).toBe('groq');
    expect(new DeepSeekProvider(inject).supportsNativeTools).toBe(false);
    expect(new XaiProvider(inject).supportsNativeTools).toBe(false);
    expect(new GroqProvider(inject).supportsNativeTools).toBe(false);
  });
});
