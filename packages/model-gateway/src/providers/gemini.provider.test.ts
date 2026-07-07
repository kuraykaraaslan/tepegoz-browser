import { describe, it, expect } from 'vitest';
import { toGeminiParams, fromGeminiResult, type GeminiGenerateResponse } from './gemini.provider';
import type { CanonRequest } from '../types';

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    capability: 'plan',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 1024,
    timeoutMs: 30000,
    ...over,
  };
}

describe('toGeminiParams', () => {
  it('lifts system messages to systemInstruction and maps assistant → model', () => {
    const params = toGeminiParams(
      req({
        model: 'gemini-2.5-pro',
        maxTokens: 256,
        messages: [
          { role: 'system', content: 'rule A' },
          { role: 'system', content: 'rule B' },
          { role: 'user', content: 'go' },
          { role: 'assistant', content: 'ok' },
        ],
      }),
    );
    expect(params.generationConfig.maxOutputTokens).toBe(256);
    expect(params.systemInstruction).toEqual({ parts: [{ text: 'rule A\n\nrule B' }] });
    expect(params.contents).toEqual([
      { role: 'user', parts: [{ text: 'go' }] },
      { role: 'model', parts: [{ text: 'ok' }] },
    ]);
  });

  it('omits systemInstruction when there is no system message', () => {
    expect(toGeminiParams(req()).systemInstruction).toBeUndefined();
  });

  it('sets responseMimeType json only when responseFormat is json', () => {
    expect(toGeminiParams(req()).generationConfig.responseMimeType).toBeUndefined();
    expect(toGeminiParams(req({ responseFormat: 'json' })).generationConfig.responseMimeType).toBe(
      'application/json',
    );
  });

  it('maps canon tools to a single functionDeclarations group', () => {
    const params = toGeminiParams(
      req({
        tools: [{ name: 'browser_get_page', description: 'read page', inputSchema: { type: 'object' } }],
      }),
    );
    expect(params.tools).toEqual([
      {
        functionDeclarations: [
          { name: 'browser_get_page', description: 'read page', parameters: { type: 'object' } },
        ],
      },
    ]);
  });
});

describe('fromGeminiResult', () => {
  function response(over: Partial<GeminiGenerateResponse> = {}): GeminiGenerateResponse {
    return {
      candidates: [{ content: { parts: [{ text: 'hello' }], role: 'model' }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
      ...over,
    };
  }

  it('reads the first candidate text and usage', () => {
    const res = fromGeminiResult(response());
    expect(res.text).toBe('hello');
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(res.stopReason).toBe('end');
  });

  it('reads a functionCall part with already-parsed args (no JSON parsing)', () => {
    const res = fromGeminiResult(
      response({
        candidates: [
          {
            content: { parts: [{ functionCall: { name: 'tab_list_items', args: { all: true } } }] },
            finishReason: 'STOP',
          },
        ],
      }),
    );
    expect(res.text).toBe('');
    expect(res.toolCalls).toEqual([{ name: 'tab_list_items', input: { all: true } }]);
    // A tool call wins over the finishReason for the canon stop reason.
    expect(res.stopReason).toBe('tool_use');
  });

  it('maps finish reasons to the canon contract', () => {
    expect(
      fromGeminiResult(response({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }))
        .stopReason,
    ).toBe('max_tokens');
    expect(
      fromGeminiResult(response({ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] }))
        .stopReason,
    ).toBe('error');
    expect(
      fromGeminiResult(response({ candidates: [{ content: { parts: [] }, finishReason: null }] }))
        .stopReason,
    ).toBe('end');
  });

  it('defaults to empty output and zero usage when the API omits candidates/usage', () => {
    const res = fromGeminiResult({ candidates: [], usageMetadata: null });
    expect(res.text).toBe('');
    expect(res.toolCalls).toEqual([]);
    expect(res.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
