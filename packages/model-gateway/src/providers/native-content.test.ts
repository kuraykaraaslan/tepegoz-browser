import { describe, it, expect } from 'vitest';
import type { CanonMessage } from '../types';
import { toOpenAIMessages } from './openai-content';
import { toGeminiParts, toolNamesById } from './gemini-content';
import { fromOpenAIResult, toOpenAIParams, OpenAIProvider } from './openai.provider';
import { toGeminiParams, fromGeminiResult, GeminiProvider } from './gemini.provider';
import { KimiProvider } from './kimi.provider';
import type { CanonRequest } from '../types';

/** One round trip: the model asks for a tool, the observation comes back keyed to that call. */
const roundTrip: CanonMessage[] = [
  { role: 'user', content: 'find the accept button' },
  {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'call_1', name: 'browser_get_elements', input: { tabId: 't1' } }],
  },
  { role: 'user', content: [{ type: 'tool_result', toolUseId: 'call_1', content: '[3] Accept' }] },
];

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    capability: 'exec',
    messages: roundTrip,
    maxTokens: 100,
    timeoutMs: 1000,
    ...over,
  };
}

describe('OpenAI native mapping', () => {
  it('puts the call on the assistant turn and the result on its own tool message', () => {
    const messages = toOpenAIMessages(roundTrip);
    expect(messages).toEqual([
      { role: 'user', content: 'find the accept button' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'browser_get_elements', arguments: '{"tabId":"t1"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '[3] Accept' },
    ]);
  });

  it('keeps a text-only turn a plain string (the shape every existing turn already sends)', () => {
    const messages = toOpenAIMessages([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
    expect(messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('switches to content parts only when an image is present', () => {
    const messages = toOpenAIMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this' },
          { type: 'image', mediaType: 'image/png', data: 'QUJD' },
        ],
      },
    ]);
    expect(messages[0]?.content).toEqual([
      { type: 'text', text: 'what is this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
    ]);
  });

  it('carries the expansion through toOpenAIParams', () => {
    expect(toOpenAIParams(req()).messages).toHaveLength(3);
  });

  it('normalizes a function call back into a CanonToolCall with its id', () => {
    const res = fromOpenAIResult({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'call_9', type: 'function', function: { name: 'browser_update_page', arguments: '{"ref":3}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toEqual([{ name: 'browser_update_page', input: { ref: 3 }, id: 'call_9' }]);
  });
});

describe('Gemini native mapping', () => {
  it('resolves a functionResponse name through the id index (Gemini correlates by name)', () => {
    const names = toolNamesById(roundTrip);
    expect(names.get('call_1')).toBe('browser_get_elements');
    const parts = toGeminiParts(roundTrip[2]!.content, names);
    expect(parts).toEqual([
      { functionResponse: { name: 'browser_get_elements', response: { content: '[3] Accept' } } },
    ]);
  });

  it('falls back to the id as the name when the call is outside the window', () => {
    const parts = toGeminiParts(
      [{ type: 'tool_result', toolUseId: 'browser_get_page', content: 'text' }],
      new Map(),
    );
    expect(parts[0]?.functionResponse?.name).toBe('browser_get_page');
  });

  it('maps a call to functionCall and an image to inlineData', () => {
    const parts = toGeminiParts(
      [
        { type: 'tool_use', id: 'x', name: 'browser_get_page', input: { tabId: 't' } },
        { type: 'image', mediaType: 'image/jpeg', data: 'QUJD' },
      ],
      new Map(),
    );
    expect(parts[0]).toEqual({ functionCall: { name: 'browser_get_page', args: { tabId: 't' } } });
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } });
  });

  it('carries the mapping through toGeminiParams and flattens only the system turn', () => {
    const body = toGeminiParams(
      req({
        provider: 'gemini',
        messages: [{ role: 'system', content: [{ type: 'text', text: 'rules' }] }, ...roundTrip],
      }),
    );
    expect(body.systemInstruction?.parts[0]?.text).toBe('rules');
    expect(body.contents[1]?.parts[0]?.functionCall?.name).toBe('browser_get_elements');
  });

  it('still reads a functionCall response back out', () => {
    const res = fromGeminiResult({
      candidates: [{ content: { parts: [{ functionCall: { name: 'tab_list_items', args: { all: true } } }] } }],
    });
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toEqual([{ name: 'tab_list_items', input: { all: true } }]);
  });
});

describe('native-tool capability flags', () => {
  it('declares openai and gemini native, kimi not', () => {
    expect(new OpenAIProvider({ client: {} as never }).supportsNativeTools).toBe(true);
    expect(new GeminiProvider({ client: {} as never }).supportsNativeTools).toBe(true);
    expect(new KimiProvider({ client: {} as never }).supportsNativeTools).toBe(false);
  });
});
