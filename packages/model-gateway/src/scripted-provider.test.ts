import { describe, it, expect } from 'vitest';
import { ScriptedProvider } from './scripted-provider';
import type { CanonRequest } from './types';

const req: CanonRequest = {
  provider: 'anthropic',
  model: 'mock',
  capability: 'exec',
  messages: [{ role: 'user', content: 'hello' }],
  maxTokens: 100,
  timeoutMs: 1000,
};

describe('ScriptedProvider', () => {
  it('replays each reply once, in order', async () => {
    const p = new ScriptedProvider(['a', 'b', 'c']);
    const ac = new AbortController();
    expect((await p.complete(req, ac.signal)).text).toBe('a');
    expect((await p.complete(req, ac.signal)).text).toBe('b');
    expect((await p.complete(req, ac.signal)).text).toBe('c');
  });

  it('sticks on the last reply once exhausted (a trailing finish terminates the loop)', async () => {
    const p = new ScriptedProvider(['first', 'last']);
    const ac = new AbortController();
    await p.complete(req, ac.signal);
    await p.complete(req, ac.signal);
    expect((await p.complete(req, ac.signal)).text).toBe('last');
    expect((await p.complete(req, ac.signal)).text).toBe('last');
  });

  it('falls back to a safe reply when given an empty sequence', async () => {
    const p = new ScriptedProvider([]);
    expect((await p.complete(req, new AbortController().signal)).text).toBe('ok');
  });

  it('honors the abort signal', () => {
    const ac = new AbortController();
    ac.abort();
    const p = new ScriptedProvider(['x']);
    expect(() => p.complete(req, ac.signal)).toThrow('aborted');
  });

  it('replays a structured turn with native tool calls (the native-arm script)', async () => {
    const p = new ScriptedProvider([
      { toolCalls: [{ name: 'browser_get_elements', input: { tabId: 't1' } }] },
      'done',
    ]);
    const ac = new AbortController();
    const first = await p.complete(req, ac.signal);
    expect(first.toolCalls).toEqual([{ name: 'browser_get_elements', input: { tabId: 't1' } }]);
    // A turn carrying tool calls IS a tool_use turn — the script does not have to say so.
    expect(first.stopReason).toBe('tool_use');
    expect(first.text).toBe('');
    const second = await p.complete(req, ac.signal);
    expect(second.stopReason).toBe('end');
    expect(second.toolCalls).toEqual([]);
  });

  it('accepts block content in the request without losing the token proxy', async () => {
    const p = new ScriptedProvider(['x']);
    const res = await p.complete(
      {
        ...req,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'twelve chars' }] }],
      },
      new AbortController().signal,
    );
    expect(res.usage.inputTokens).toBe('twelve chars'.length);
  });

  it('reports token usage and carries the provider id', async () => {
    const p = new ScriptedProvider(['reply'], 'openai');
    expect(p.id).toBe('openai');
    const res = await p.complete(req, new AbortController().signal);
    expect(res.usage.outputTokens).toBe('reply'.length);
    expect(res.usage.inputTokens).toBeGreaterThan(0);
  });
});
