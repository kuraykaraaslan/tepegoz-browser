import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { AxiosInstance } from '@tepegoz/http';
import { toOpenAIParams } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import type { CanonRequest } from './types';

/**
 * Guard for the AI-integration invariant "streaming is NOT written to the DB — only a full, validated
 * response is committed to the Journal." The invariant holds by CONSTRUCTION: every provider adapter is
 * non-streaming, so a response only exists once complete, and nothing partial can reach a journal write.
 * These tests LOCK that — adding a streaming path (which could emit partial output) breaks them.
 */
function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'openai',
    model: 'm',
    capability: 'exec',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 100,
    timeoutMs: 1000,
    ...over,
  };
}

describe('model adapters are non-streaming (no partial output can reach the Journal)', () => {
  it('OpenAI request never enables streaming', () => {
    expect('stream' in toOpenAIParams(req())).toBe(false);
  });

  it('Gemini uses the non-streaming generateContent endpoint (not streamGenerateContent)', async () => {
    const post = vi.fn().mockResolvedValue({ data: { candidates: [], usageMetadata: null } });
    const client = { post } as unknown as AxiosInstance;
    await new GeminiProvider({ client }).complete(
      req({ provider: 'gemini' }),
      new AbortController().signal,
    );
    expect(post).toHaveBeenCalledTimes(1);
    const url = post.mock.calls[0]?.[0] as string;
    expect(url).toContain(':generateContent');
    expect(url).not.toContain(':streamGenerateContent');
  });

  it('Anthropic uses messages.create (non-streaming), never the streaming API', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const stream = vi.fn();
    const client = { messages: { create, stream } } as unknown as Anthropic;
    await new AnthropicProvider({ client }).complete(
      req({ provider: 'anthropic' }),
      new AbortController().signal,
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(stream).not.toHaveBeenCalled();
  });
});
