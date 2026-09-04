import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `llama-engine.electron` — the main-process `LlamaEngine` over `node-llama-cpp`. Pinned: the module
 * loads lazily and `isAvailable()` reflects whether `getLlama()` resolved; `load` warms one model +
 * chat session per id (cached) and 503s when the binary is unavailable; `generate` serializes,
 * 409s an unloaded handle, lifts system turns into history, prompts with the last user turn, maps the
 * stop reason to a finish reason, and returns best-effort token counts; grammars are compiled once and
 * cached; and `unload` disposes the context + model.
 */

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { warn: vi.fn() } }));
vi.mock('@tepegoz/model-gateway', () => ({
  contentToText: (c: unknown) => (typeof c === 'string' ? c : JSON.stringify(c)),
}));

const model = vi.hoisted(() => ({
  createContext: vi.fn(),
  tokenize: vi.fn((s: string) => s.split(/\s+/).filter(Boolean)),
  dispose: vi.fn(() => Promise.resolve()),
}));
const context = vi.hoisted(() => ({
  getSequence: vi.fn(() => ({ __seq: true })),
  dispose: vi.fn(() => Promise.resolve()),
}));
const session = vi.hoisted(() => ({
  setChatHistory: vi.fn(),
  promptWithMeta: vi.fn(() => Promise.resolve({ responseText: 'the answer', stopReason: 'stop' })),
}));
const llama = vi.hoisted(() => ({
  loadModel: vi.fn(),
  createGrammar: vi.fn(() => Promise.resolve({ __grammar: true })),
}));
const getLlama = vi.hoisted(() => vi.fn((): Promise<unknown> => Promise.resolve(llama)));
const LlamaChatSession = vi.hoisted(() =>
  vi.fn(function LlamaChatSession(this: Record<string, unknown>) {
    this.setChatHistory = session.setChatHistory;
    this.promptWithMeta = session.promptWithMeta;
  }),
);
vi.mock('node-llama-cpp', () => ({ getLlama, LlamaChatSession }));

type Mod = typeof import('./llama-engine.electron');
async function load(): Promise<Mod> {
  vi.resetModules();
  return import('./llama-engine.electron');
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  vi.clearAllMocks();
  model.createContext.mockResolvedValue(context);
  model.tokenize.mockImplementation((s: string) => s.split(/\s+/).filter(Boolean));
  llama.loadModel.mockResolvedValue(model);
  llama.createGrammar.mockResolvedValue({ __grammar: true });
  getLlama.mockResolvedValue(llama);
  session.promptWithMeta.mockResolvedValue({ responseText: 'the answer', stopReason: 'stop' });
});

describe('isAvailable', () => {
  it('is true once getLlama resolves', async () => {
    const mod = await load();
    const eng = mod.llamaEngine();
    // The constructor's `void ensureLlama()` settles on its own microtask chain — poll rather than
    // guess a fixed number of macrotask ticks (a fixed `flush()` loses this race under a full run).
    await vi.waitFor(() => expect(eng.isAvailable()).toBe(true));
  });

  it('is false and logs when the native binary cannot load', async () => {
    getLlama.mockRejectedValue(new Error('no prebuilt binary'));
    const mod = await load();
    const eng = mod.llamaEngine();
    await flush();
    expect(eng.isAvailable()).toBe(false);
  });
});

describe('load', () => {
  it('warms one model + context + session per id and caches it', async () => {
    const mod = await load();
    const eng = mod.llamaEngine();
    const handle = await eng.load('m1', '/models/m1.gguf', 4096);
    expect(handle).toEqual({ modelId: 'm1', ctxSize: 4096 });
    expect(llama.loadModel).toHaveBeenCalledWith({ modelPath: '/models/m1.gguf' });
    expect(model.createContext).toHaveBeenCalledWith({ contextSize: 4096 });

    await eng.load('m1', '/models/m1.gguf', 4096);
    expect(llama.loadModel).toHaveBeenCalledTimes(1);
  });

  it('503s when on-device inference is unavailable', async () => {
    getLlama.mockRejectedValue(new Error('nope'));
    const mod = await load();
    const eng = mod.llamaEngine();
    await expect(eng.load('m1', '/p', 2048)).rejects.toMatchObject({
      statusCode: 503,
      code: 'inferenceUnavailable',
    });
  });
});

describe('generate', () => {
  it('409s a handle whose model was never loaded', async () => {
    const mod = await load();
    const eng = mod.llamaEngine();
    await expect(
      eng.generate({ modelId: 'ghost', ctxSize: 2048 }, [], { maxTokens: 10 } as never),
    ).rejects.toMatchObject({ statusCode: 409, code: 'localModelNotLoaded' });
  });

  it('lifts system turns, prompts with the last user turn, and maps the finish reason', async () => {
    const mod = await load();
    const eng = mod.llamaEngine();
    const handle = await eng.load('m1', '/p', 4096);
    const res = await eng.generate(
      handle,
      [
        { role: 'system', content: 'You are terse' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: 'again' },
      ] as never,
      { maxTokens: 64 } as never,
    );
    expect(session.setChatHistory).toHaveBeenCalledWith([
      { type: 'system', text: 'You are terse' },
      { type: 'user', text: 'hello' },
      { type: 'model', response: ['hi'] },
    ]);
    expect(session.promptWithMeta).toHaveBeenCalledWith(
      'again',
      expect.objectContaining({ maxTokens: 64, stopOnAbortSignal: true }),
    );
    expect(res).toMatchObject({ text: 'the answer', finish: 'stop' });
    expect(res.inputTokens).toBeGreaterThan(0);
    expect(res.outputTokens).toBe(2);
  });

  it('maps maxTokens / abort stop reasons to length / abort', async () => {
    const mod = await load();
    const eng = mod.llamaEngine();
    const handle = await eng.load('m1', '/p', 4096);

    session.promptWithMeta.mockResolvedValue({ responseText: 'x', stopReason: 'maxTokens' });
    expect(
      (await eng.generate(handle, [{ role: 'user', content: 'a' }] as never, {} as never)).finish,
    ).toBe('length');

    session.promptWithMeta.mockResolvedValue({ responseText: '', stopReason: 'abort' });
    expect(
      (await eng.generate(handle, [{ role: 'user', content: 'a' }] as never, {} as never)).finish,
    ).toBe('abort');
  });

  it('compiles a grammar once and reuses it', async () => {
    const mod = await load();
    const eng = mod.llamaEngine();
    const handle = await eng.load('m1', '/p', 4096);
    const gbnf = 'root ::= "yes"';
    await eng.generate(
      handle,
      [{ role: 'user', content: 'a' }] as never,
      { grammar: gbnf } as never,
    );
    await eng.generate(
      handle,
      [{ role: 'user', content: 'b' }] as never,
      { grammar: gbnf } as never,
    );
    expect(llama.createGrammar).toHaveBeenCalledTimes(1);
    expect(session.promptWithMeta).toHaveBeenLastCalledWith(
      'b',
      expect.objectContaining({ grammar: { __grammar: true } }),
    );
  });
});

describe('unload', () => {
  it('is a no-op for an unknown model id', async () => {
    const mod = await load();
    const eng = mod.llamaEngine();
    await expect(eng.unload('nope')).resolves.toBeUndefined();
  });

  it('disposes the context and model for a loaded id', async () => {
    const mod = await load();
    const eng = mod.llamaEngine();
    await eng.load('m1', '/p', 4096);
    await eng.unload('m1');
    expect(context.dispose).toHaveBeenCalled();
    expect(model.dispose).toHaveBeenCalled();
  });
});
