import { describe, it, expect } from 'vitest';
import { toAnthropicParams, fromAnthropicResult, type AnthropicCompletion } from './anthropic.provider';
import type { CanonRequest } from '../types';

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    capability: 'plan',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 1024,
    timeoutMs: 30000,
    ...over,
  };
}

describe('toAnthropicParams', () => {
  it('lifts system messages into the top-level system field', () => {
    const params = toAnthropicParams(
      req({
        messages: [
          { role: 'system', content: 'rule A' },
          { role: 'system', content: 'rule B' },
          { role: 'user', content: 'go' },
          { role: 'assistant', content: 'ok' },
        ],
      }),
    );
    expect(params.system).toBe('rule A\n\nrule B');
    expect(params.messages).toEqual([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'ok' },
    ]);
  });

  it('carries model + max_tokens through', () => {
    const params = toAnthropicParams(req({ model: 'claude-haiku-4-5', maxTokens: 256 }));
    expect(params.model).toBe('claude-haiku-4-5');
    expect(params.max_tokens).toBe(256);
  });

  it('maps canon tools to Anthropic tool definitions', () => {
    const params = toAnthropicParams(
      req({
        tools: [{ name: 'browser_get_page', description: 'read page', inputSchema: { type: 'object' } }],
      }),
    );
    expect(params.tools).toEqual([
      { name: 'browser_get_page', description: 'read page', input_schema: { type: 'object' } },
    ]);
  });

  it('never emits budget_tokens and omits thinking/effort by default', () => {
    const params = toAnthropicParams(req());
    expect(params.thinking).toBeUndefined();
    expect(params.output_config).toBeUndefined();
    expect(JSON.stringify(params)).not.toContain('budget_tokens');
  });

  it('emits adaptive thinking (summarized) and effort only when requested', () => {
    const params = toAnthropicParams(req(), { thinking: true, effort: 'xhigh' });
    expect(params.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(params.output_config).toEqual({ effort: 'xhigh' });
    expect(JSON.stringify(params)).not.toContain('budget_tokens');
  });
});

describe('fromAnthropicResult', () => {
  function completion(over: Partial<AnthropicCompletion> = {}): AnthropicCompletion {
    return {
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 3 },
      ...over,
    };
  }

  it('concatenates text blocks and reads usage', () => {
    const res = fromAnthropicResult(
      completion({ content: [{ type: 'text', text: 'foo' }, { type: 'text', text: 'bar' }] }),
    );
    expect(res.text).toBe('foobar');
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(res.stopReason).toBe('end');
  });

  it('extracts tool_use blocks as tool calls', () => {
    const res = fromAnthropicResult(
      completion({
        content: [
          { type: 'text', text: 'calling' },
          { type: 'tool_use', id: 'tu_1', name: 'tab_list_items', input: { all: true } },
        ],
        stop_reason: 'tool_use',
      }),
    );
    expect(res.text).toBe('calling');
    expect(res.toolCalls).toEqual([{ name: 'tab_list_items', input: { all: true } }]);
    expect(res.stopReason).toBe('tool_use');
  });

  it('maps stop reasons to the canon contract', () => {
    expect(fromAnthropicResult(completion({ stop_reason: 'max_tokens' })).stopReason).toBe('max_tokens');
    expect(fromAnthropicResult(completion({ stop_reason: 'refusal' })).stopReason).toBe('error');
    expect(fromAnthropicResult(completion({ stop_reason: 'pause_turn' })).stopReason).toBe('end');
    expect(fromAnthropicResult(completion({ stop_reason: null })).stopReason).toBe('end');
  });
});
