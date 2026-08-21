import { describe, it, expect } from 'vitest';
import type { CanonRequest } from '@tepegoz/model-gateway';
import { LocalProvider } from './local-provider';
import type { GenerateOptions, GenerateResult, LlamaEngine, LocalModelHandle } from './types';

/** In-memory engine — records the last generate() call so tests can assert what was passed. No native. */
class FakeLlamaEngine implements LlamaEngine {
  lastTurnsCount = -1;
  lastOpts: GenerateOptions | null = null;
  loadCalls: string[] = [];
  constructor(private readonly canned: GenerateResult) {}
  load(modelId: string, _modelPath: string, ctxSize: number): Promise<LocalModelHandle> {
    this.loadCalls.push(modelId);
    return Promise.resolve({ modelId, ctxSize });
  }
  generate(
    _handle: LocalModelHandle,
    turns: readonly unknown[],
    opts: GenerateOptions,
  ): Promise<GenerateResult> {
    this.lastTurnsCount = turns.length;
    this.lastOpts = opts;
    return Promise.resolve(this.canned);
  }
  unload(): Promise<void> {
    return Promise.resolve();
  }
  isAvailable(): boolean {
    return true;
  }
}

const CANNED: GenerateResult = {
  text: '{"action":"finish"}',
  finish: 'stop',
  inputTokens: 7,
  outputTokens: 4,
};

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'local',
    model: 'local-slm',
    capability: 'exec',
    messages: [
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'go' },
    ],
    maxTokens: 512,
    timeoutMs: 30000,
    ...over,
  };
}

describe('LocalProvider', () => {
  it('throws a 503 when no model is selected', async () => {
    const engine = new FakeLlamaEngine(CANNED);
    const provider = new LocalProvider({ engine, resolveModel: () => null });
    await expect(provider.complete(req(), new AbortController().signal)).rejects.toThrow(
      /local model/i,
    );
  });

  it('loads the selected model and maps the result', async () => {
    const engine = new FakeLlamaEngine(CANNED);
    const provider = new LocalProvider({
      engine,
      resolveModel: () => ({
        modelId: 'tepegoz-slm-1',
        modelPath: '/models/x.gguf',
        ctxSize: 4096,
      }),
    });
    const res = await provider.complete(req(), new AbortController().signal);
    expect(engine.loadCalls).toEqual(['tepegoz-slm-1']);
    expect(engine.lastTurnsCount).toBe(2);
    expect(res).toEqual({
      text: '{"action":"finish"}',
      stopReason: 'end',
      usage: { inputTokens: 7, outputTokens: 4 },
      toolCalls: [],
    });
  });

  it('passes a GBNF grammar only when responseFormat is json', async () => {
    const engine = new FakeLlamaEngine(CANNED);
    const provider = new LocalProvider({
      engine,
      resolveModel: () => ({ modelId: 'm', modelPath: '/m.gguf', ctxSize: 2048 }),
    });
    await provider.complete(req(), new AbortController().signal);
    expect(engine.lastOpts?.grammar).toBeUndefined();

    await provider.complete(req({ responseFormat: 'json' }), new AbortController().signal);
    expect(engine.lastOpts?.grammar).toMatch(/root\s+::= object/);
  });

  it('forwards the abort signal and configured sampling to the engine', async () => {
    const engine = new FakeLlamaEngine(CANNED);
    const provider = new LocalProvider({
      engine,
      resolveModel: () => ({ modelId: 'm', modelPath: '/m.gguf', ctxSize: 2048 }),
      sampling: { temperature: 0.1, topP: 0.9 },
    });
    const ctrl = new AbortController();
    await provider.complete(req(), ctrl.signal);
    expect(engine.lastOpts?.signal).toBe(ctrl.signal);
    expect(engine.lastOpts?.temperature).toBe(0.1);
    expect(engine.lastOpts?.topP).toBe(0.9);
    expect(engine.lastOpts?.maxTokens).toBe(512);
  });
});
