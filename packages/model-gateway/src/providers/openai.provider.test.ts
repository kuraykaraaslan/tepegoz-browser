import { describe, it, expect } from 'vitest';
import { toOpenAIParams, fromOpenAIResult, type OpenAICompletion } from './openai.provider';
import type { CanonRequest } from '../types';

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    capability: 'plan',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 1024,
    timeoutMs: 30000,
    ...over,
  };
}

describe('toOpenAIParams', () => {
  it('keeps system messages inline (no top-level lift) and carries model + cap', () => {
    const params = toOpenAIParams(
      req({
        model: 'gpt-4o-mini',
        maxTokens: 256,
        messages: [
          { role: 'system', content: 'rule A' },
          { role: 'user', content: 'go' },
          { role: 'assistant', content: 'ok' },
        ],
      }),
    );
    expect(params.model).toBe('gpt-4o-mini');
    expect(params.max_completion_tokens).toBe(256);
    expect(params.messages).toEqual([
      { role: 'system', content: 'rule A' },
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'ok' },
    ]);
  });

  it('never sends the deprecated max_tokens or a reasoning_effort field', () => {
    const params = toOpenAIParams(req());
    expect('max_tokens' in params).toBe(false);
    expect('reasoning_effort' in params).toBe(false);
  });

  it('sets json_object response_format only when responseFormat is json', () => {
    expect(toOpenAIParams(req()).response_format).toBeUndefined();
    expect(toOpenAIParams(req({ responseFormat: 'json' })).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('maps canon tools to OpenAI function tool definitions', () => {
    const params = toOpenAIParams(
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
});

describe('fromOpenAIResult', () => {
  function completion(over: Partial<OpenAICompletion> = {}): OpenAICompletion {
    return {
      choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
      ...over,
    };
  }

  it('reads the first choice text and usage', () => {
    const res = fromOpenAIResult(completion());
    expect(res.text).toBe('hello');
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(res.stopReason).toBe('end');
  });

  it('parses tool-call JSON arguments into structured input', () => {
    const res = fromOpenAIResult(
      completion({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  type: 'function',
                  function: { name: 'tab_list_items', arguments: '{"all":true}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
    expect(res.text).toBe('');
    expect(res.toolCalls).toEqual([{ name: 'tab_list_items', input: { all: true } }]);
    expect(res.stopReason).toBe('tool_use');
  });

  it('keeps malformed tool arguments as the raw string (rejected downstream, not dropped)', () => {
    const res = fromOpenAIResult(
      completion({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ type: 'function', function: { name: 'x', arguments: 'not json' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
    expect(res.toolCalls).toEqual([{ name: 'x', input: 'not json' }]);
  });

  it('skips non-function (custom) tool calls', () => {
    const res = fromOpenAIResult(
      completion({
        choices: [
          {
            message: { content: '', tool_calls: [{ type: 'custom' }] },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
    expect(res.toolCalls).toEqual([]);
  });

  it('maps finish reasons to the canon contract', () => {
    expect(
      fromOpenAIResult(
        completion({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
      ).stopReason,
    ).toBe('max_tokens');
    expect(
      fromOpenAIResult(
        completion({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] }),
      ).stopReason,
    ).toBe('error');
    expect(
      fromOpenAIResult(completion({ choices: [{ message: { content: '' }, finish_reason: null }] }))
        .stopReason,
    ).toBe('end');
  });

  it('defaults usage to zero when the API omits it', () => {
    const res = fromOpenAIResult(completion({ usage: null }));
    expect(res.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
