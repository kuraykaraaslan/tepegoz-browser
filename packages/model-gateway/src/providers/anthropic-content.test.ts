import { describe, it, expect } from 'vitest';
import type { CanonContentBlock } from '@tepegoz/shared-types';
import { toAnthropicContent } from './anthropic-content';
import { toAnthropicParams, fromAnthropicResult } from './anthropic.provider';
import type { CanonRequest } from '../types';

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    capability: 'exec',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 100,
    timeoutMs: 1000,
    ...over,
  };
}

describe('Anthropic native content mapping', () => {
  it('passes a plain string straight through (the normalized default pays nothing)', () => {
    expect(toAnthropicContent('hello')).toBe('hello');
  });

  it('maps an image to a base64 source rather than a text marker', () => {
    const blocks: CanonContentBlock[] = [{ type: 'image', mediaType: 'image/png', data: 'QUJD' }];
    expect(toAnthropicContent(blocks)).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
    ]);
  });

  it('maps tool_use and tool_result with the id that correlates them', () => {
    const blocks: CanonContentBlock[] = [
      { type: 'tool_use', id: 'toolu_1', name: 'browser_get_elements', input: { tabId: 't1' } },
      { type: 'tool_result', toolUseId: 'toolu_1', content: '[3] button', isError: true },
    ];
    expect(toAnthropicContent(blocks)).toEqual([
      { type: 'tool_use', id: 'toolu_1', name: 'browser_get_elements', input: { tabId: 't1' } },
      { type: 'tool_result', tool_use_id: 'toolu_1', content: '[3] button', is_error: true },
    ]);
  });

  it('omits is_error on a successful tool result', () => {
    const blocks: CanonContentBlock[] = [
      { type: 'tool_result', toolUseId: 'toolu_1', content: 'ok' },
    ];
    expect(toAnthropicContent(blocks)[0]).not.toHaveProperty('is_error');
  });

  it('carries block content through toAnthropicParams onto the user turn', () => {
    const params = toAnthropicParams(
      req({ messages: [{ role: 'user', content: [{ type: 'text', text: 'look' }] }] }),
    );
    expect(params.messages[0]?.content).toEqual([{ type: 'text', text: 'look' }]);
  });

  it('still lifts system turns to the top-level system field, flattened to text', () => {
    const params = toAnthropicParams(
      req({
        messages: [
          { role: 'system', content: [{ type: 'text', text: 'be careful' }] },
          { role: 'user', content: 'go' },
        ],
      }),
    );
    expect(params.system).toBe('be careful');
    expect(params.messages).toHaveLength(1);
  });

  it('normalizes a native tool_use response into a CanonToolCall that keeps its id', () => {
    const res = fromAnthropicResult({
      content: [
        { type: 'text', text: 'calling' },
        { type: 'tool_use', id: 'toolu_9', name: 'browser_update_page', input: { ref: 3 } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 5, output_tokens: 7 },
    });
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toEqual([
      { name: 'browser_update_page', input: { ref: 3 }, id: 'toolu_9' },
    ]);
  });
});
