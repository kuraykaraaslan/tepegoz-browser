import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicProvider,
  toAnthropicParams,
  fromAnthropicResult,
  type AnthropicCompletion,
} from './anthropic.provider';
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
        tools: [
          { name: 'browser_get_page', description: 'read page', inputSchema: { type: 'object' } },
        ],
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

  it('maps a forced tool_choice to { type: "tool", name } and "auto" otherwise (needs tools present)', () => {
    const withTools = { tools: [{ name: 't', description: 'd', inputSchema: { type: 'object' } }] };
    expect(
      toAnthropicParams(req({ ...withTools, toolChoice: { type: 'tool', name: 't' } })).tool_choice,
    ).toEqual({ type: 'tool', name: 't' });
    expect(
      toAnthropicParams(req({ ...withTools, toolChoice: { type: 'auto' } })).tool_choice,
    ).toEqual({ type: 'auto' });
    // No tools → tool_choice is never emitted even when requested.
    expect(
      toAnthropicParams(req({ toolChoice: { type: 'tool', name: 't' } })).tool_choice,
    ).toBeUndefined();
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
      completion({
        content: [
          { type: 'text', text: 'foo' },
          { type: 'text', text: 'bar' },
        ],
      }),
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
    // S1 PR2: the vendor's correlation id is now carried, so a tool_result can echo it back.
    expect(res.toolCalls).toEqual([{ name: 'tab_list_items', input: { all: true }, id: 'tu_1' }]);
    expect(res.stopReason).toBe('tool_use');
  });

  it('maps stop reasons to the canon contract', () => {
    expect(fromAnthropicResult(completion({ stop_reason: 'max_tokens' })).stopReason).toBe(
      'max_tokens',
    );
    expect(fromAnthropicResult(completion({ stop_reason: 'refusal' })).stopReason).toBe('error');
    expect(fromAnthropicResult(completion({ stop_reason: 'pause_turn' })).stopReason).toBe('end');
    expect(fromAnthropicResult(completion({ stop_reason: null })).stopReason).toBe('end');
  });
});

/** A fake Anthropic client: only the three surfaces this adapter touches. */
function fakeClient(over: {
  create?: (params: unknown, opts: unknown) => Promise<unknown>;
  stream?: (params: unknown, opts: unknown) => unknown;
  countTokens?: (params: unknown) => Promise<{ input_tokens: number }>;
}) {
  return {
    messages: {
      create: over.create ?? (() => Promise.resolve(MESSAGE)),
      stream: over.stream ?? (() => streamOf([])),
      countTokens: over.countTokens ?? (() => Promise.resolve({ input_tokens: 0 })),
    },
  } as unknown as Anthropic;
}

const MESSAGE = {
  content: [{ type: 'text', text: 'done' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 3, output_tokens: 4 },
};

/** A minimal stand-in for the SDK's MessageStream: `.on(event, cb)` plus `.finalMessage()`. */
function streamOf(events: { event: 'text' | 'inputJson'; value: string }[], final = MESSAGE) {
  const handlers = new Map<string, (v: string) => void>();
  return {
    on(event: string, cb: (v: string) => void) {
      handlers.set(event, cb);
      return this;
    },
    finalMessage() {
      for (const e of events) handlers.get(e.event)?.(e.value);
      return Promise.resolve(final);
    },
  };
}

describe('AnthropicProvider client construction', () => {
  it('reuses one client per API key rather than opening a pool per run', () => {
    // The SDK client holds a keep-alive connection pool; building one per run wastes sockets.
    const a = new AnthropicProvider({ apiKey: 'key-one' });
    const b = new AnthropicProvider({ apiKey: 'key-one' });
    const c = new AnthropicProvider({ apiKey: 'key-two' });
    const clientOf = (p: AnthropicProvider): unknown =>
      (p as unknown as { client: unknown }).client;

    expect(clientOf(a)).toBe(clientOf(b));
    expect(clientOf(a)).not.toBe(clientOf(c));
  });

  it('keeps a keyless client separate, and prefers an injected one over the cache', () => {
    const keyless = new AnthropicProvider({});
    const keyed = new AnthropicProvider({ apiKey: 'key-one' });
    const clientOf = (p: AnthropicProvider): unknown =>
      (p as unknown as { client: unknown }).client;
    expect(clientOf(keyless)).not.toBe(clientOf(keyed));

    const injected = fakeClient({});
    expect(clientOf(new AnthropicProvider({ apiKey: 'key-one', client: injected }))).toBe(injected);
  });
});

describe('AnthropicProvider.complete error mapping', () => {
  const provider = (over: Parameters<typeof fakeClient>[0]): AnthropicProvider =>
    new AnthropicProvider({ client: fakeClient(over) });

  it('keeps a 4xx status, because that one is the caller to fix', async () => {
    const err = new Anthropic.APIError(429, undefined, 'rate limited', undefined);
    const p = provider({ create: () => Promise.reject(err) });
    // the SDK stamps the status into its own message; the adapter keeps it verbatim
    await expect(p.complete(req(), new AbortController().signal)).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it('reports a 5xx as 503 upstream-down rather than passing it through', async () => {
    // The distinction the caller acts on is "retry" vs "fix the request", and a 500 from the model
    // host is the retryable one — it says nothing about what we sent.
    const err = new Anthropic.APIError(500, undefined, 'internal', undefined);
    const p = provider({ create: () => Promise.reject(err) });
    await expect(p.complete(req(), new AbortController().signal)).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('passes a plain Error through unchanged, and wraps a thrown non-Error', async () => {
    const plain = new Error('socket hang up');
    await expect(
      provider({ create: () => Promise.reject(plain) }).complete(
        req(),
        new AbortController().signal,
      ),
    ).rejects.toBe(plain);

    const notAnError = 'something fell over' as unknown as Error;
    await expect(
      provider({ create: () => Promise.reject(notAnError) }).complete(
        req(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('reports an aborted request as a timeout, whatever the SDK threw', async () => {
    // An abort is the deadline firing, not an upstream failure — and the SDK's own abort error says
    // nothing a user could act on.
    const controller = new AbortController();
    const p = provider({
      create: () => {
        controller.abort();
        return Promise.reject(new Error('Request was aborted.'));
      },
    });
    await expect(p.complete(req(), controller.signal)).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('AnthropicProvider.completeStream', () => {
  it('forwards prose fragments and still returns the settled response', async () => {
    const deltas: string[] = [];
    const p = new AnthropicProvider({
      client: fakeClient({
        stream: () =>
          streamOf([
            { event: 'text', value: 'Hel' },
            { event: 'text', value: 'lo' },
          ]),
      }),
    });

    const res = await p.completeStream(req(), new AbortController().signal, (d) => deltas.push(d));

    expect(deltas).toEqual(['Hel', 'lo']);
    expect(res.text).toBe('done');
    expect(res.usage).toMatchObject({ inputTokens: 3, outputTokens: 4 });
  });

  it('also forwards partial tool JSON, or a native-decision turn would stream nothing at all', async () => {
    // The whole turn on the native arm IS a tool input. Nothing parses these fragments; they exist so
    // a human can see that work is happening.
    const deltas: string[] = [];
    const p = new AnthropicProvider({
      client: fakeClient({
        stream: () =>
          streamOf([
            { event: 'inputJson', value: '{"url":' },
            { event: 'inputJson', value: '"https://x/"}' },
          ]),
      }),
    });

    await p.completeStream(req(), new AbortController().signal, (d) => deltas.push(d));
    expect(deltas).toEqual(['{"url":', '"https://x/"}']);
  });

  it('maps a stream failure the same way complete does, timeout included', async () => {
    const err = new Anthropic.APIError(401, undefined, 'bad key', undefined);
    const failing = new AnthropicProvider({
      client: fakeClient({
        stream: () => {
          throw err;
        },
      }),
    });
    await expect(
      failing.completeStream(req(), new AbortController().signal, () => undefined),
    ).rejects.toMatchObject({ statusCode: 401 });

    const controller = new AbortController();
    const aborted = new AnthropicProvider({
      client: fakeClient({
        stream: () => {
          controller.abort();
          throw new Error('aborted');
        },
      }),
    });
    await expect(
      aborted.completeStream(req(), controller.signal, () => undefined),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('AnthropicProvider.countInputTokens', () => {
  it('counts against the same params a real request would send', async () => {
    // Counting a different prompt than the one that will be sent is worse than not counting: it
    // reports a budget the run will not honour.
    let seen: Record<string, unknown> = {};
    const p = new AnthropicProvider({
      client: fakeClient({
        countTokens: (params) => {
          seen = params as Record<string, unknown>;
          return Promise.resolve({ input_tokens: 42 });
        },
      }),
    });

    const n = await p.countInputTokens(
      req({
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'hi' },
        ],
        tools: [{ name: 'browser_get_page', description: 'read', inputSchema: { type: 'object' } }],
      }),
    );

    expect(n).toBe(42);
    expect(seen.model).toBe('claude-opus-4-8');
    expect(seen.system).toBe('be brief');
    expect(seen.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(Array.isArray(seen.tools)).toBe(true);
  });

  it('omits system and tools when the request carries neither', async () => {
    let seen: Record<string, unknown> = {};
    const p = new AnthropicProvider({
      client: fakeClient({
        countTokens: (params) => {
          seen = params as Record<string, unknown>;
          return Promise.resolve({ input_tokens: 1 });
        },
      }),
    });

    await p.countInputTokens(req());
    expect('system' in seen).toBe(false);
    expect('tools' in seen).toBe(false);
  });
});
