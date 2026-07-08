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

  it('reports token usage and carries the provider id', async () => {
    const p = new ScriptedProvider(['reply'], 'openai');
    expect(p.id).toBe('openai');
    const res = await p.complete(req, new AbortController().signal);
    expect(res.usage.outputTokens).toBe('reply'.length);
    expect(res.usage.inputTokens).toBeGreaterThan(0);
  });
});
