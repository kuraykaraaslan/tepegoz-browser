import type {
  ChatHistoryItem,
  Llama,
  LlamaChatSession,
  LlamaContext,
  LlamaGrammar,
  LlamaModel,
} from 'node-llama-cpp';
import { Logger } from '@tepegoz/libs';
import { contentToText, type CanonMessage } from '@tepegoz/model-gateway';
import type {
  GenerateOptions,
  GenerateResult,
  LlamaEngine,
  LocalModelHandle,
} from '@tepegoz/local-inference';

/**
 * Electron main-process implementation of the {@link LlamaEngine} seam over `node-llama-cpp` (GGUF).
 * The module is loaded LAZILY via dynamic `import()` so the native binary never eager-loads (and never
 * reaches the renderer); `getLlama()` self-downloads the prebuilt binary on first use. A single llama
 * context is not re-entrant, so `generate` calls are serialized on a promise queue. One warm model +
 * chat session is kept per model id; the reactor re-sends the full conversation each step, so each
 * `generate` resets the session history and prompts with the last user turn.
 */
type NodeLlamaCpp = typeof import('node-llama-cpp');

interface LoadedModel {
  model: LlamaModel;
  context: LlamaContext;
  session: LlamaChatSession;
}

class LlamaEngineElectron implements LlamaEngine {
  private nlc: NodeLlamaCpp | null = null;
  private llama: Llama | null = null;
  private available = false;
  private readonly loaded = new Map<string, LoadedModel>();
  private readonly grammars = new Map<string, LlamaGrammar>();
  /** Serializes generate() calls (a single context can't run concurrent generations). */
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    // Warm up in the background so isAvailable() is ready by the time the first run resolves a provider.
    void this.ensureLlama();
  }

  private async ensureLlama(): Promise<Llama | null> {
    if (this.llama !== null) return this.llama;
    try {
      this.nlc ??= await import('node-llama-cpp');
      this.llama = await this.nlc.getLlama();
      this.available = true;
      return this.llama;
    } catch (err) {
      Logger.warn('On-device inference unavailable (node-llama-cpp)', { err: String(err) });
      this.available = false;
      return null;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async load(modelId: string, modelPath: string, ctxSize: number): Promise<LocalModelHandle> {
    const llama = await this.ensureLlama();
    if (llama === null || this.nlc === null) {
      throw new Error('On-device inference is unavailable on this machine.');
    }
    let entry = this.loaded.get(modelId);
    if (entry === undefined) {
      const model = await llama.loadModel({ modelPath });
      const context = await model.createContext({ contextSize: ctxSize });
      const session = new this.nlc.LlamaChatSession({ contextSequence: context.getSequence() });
      entry = { model, context, session };
      this.loaded.set(modelId, entry);
    }
    return { modelId, ctxSize };
  }

  generate(
    handle: LocalModelHandle,
    turns: readonly CanonMessage[],
    opts: GenerateOptions,
  ): Promise<GenerateResult> {
    const run = this.queue.then(() => this.runGenerate(handle, turns, opts));
    // Keep the queue alive even if this generation rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runGenerate(
    handle: LocalModelHandle,
    turns: readonly CanonMessage[],
    opts: GenerateOptions,
  ): Promise<GenerateResult> {
    const entry = this.loaded.get(handle.modelId);
    if (entry === undefined) throw new Error('Local model not loaded.');

    // Lift system turns; map the rest into chat history, prompting with the last user turn. Local GGUF
    // is a text-only transport (S1 keeps it on the JSON-in-text path via the JSON grammar), so block
    // content is flattened here — an image becomes an explicit marker, never a silent drop.
    const system = turns
      .filter((t) => t.role === 'system')
      .map((t) => contentToText(t.content))
      .join('\n\n');
    const rest = turns.filter((t) => t.role !== 'system');
    const promptText = rest.length > 0 ? contentToText(rest[rest.length - 1]?.content ?? '') : '';
    const history: ChatHistoryItem[] = [];
    if (system.length > 0) history.push({ type: 'system', text: system });
    for (const t of rest.slice(0, -1)) {
      history.push(
        t.role === 'assistant'
          ? { type: 'model', response: [contentToText(t.content)] }
          : { type: 'user', text: contentToText(t.content) },
      );
    }
    entry.session.setChatHistory(history);

    const grammar = opts.grammar !== undefined ? await this.getGrammar(opts.grammar) : undefined;
    const res = await entry.session.promptWithMeta(promptText, {
      maxTokens: opts.maxTokens,
      signal: opts.signal,
      stopOnAbortSignal: true,
      ...(grammar !== undefined ? { grammar } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.topP !== undefined ? { topP: opts.topP } : {}),
    });

    const finish: GenerateResult['finish'] =
      res.stopReason === 'maxTokens' ? 'length' : res.stopReason === 'abort' ? 'abort' : 'stop';
    // Best-effort token counts (llama.cpp doesn't return usage from a chat prompt).
    const inputTokens = entry.model.tokenize(
      system + rest.map((t) => contentToText(t.content)).join('\n'),
    ).length;
    const outputTokens = entry.model.tokenize(res.responseText).length;
    return { text: res.responseText, finish, inputTokens, outputTokens };
  }

  private async getGrammar(gbnf: string): Promise<LlamaGrammar> {
    let g = this.grammars.get(gbnf);
    if (g === undefined) {
      const llama = await this.ensureLlama();
      if (llama === null) throw new Error('On-device inference is unavailable.');
      g = await llama.createGrammar({ grammar: gbnf });
      this.grammars.set(gbnf, g);
    }
    return g;
  }

  async unload(modelId: string): Promise<void> {
    const entry = this.loaded.get(modelId);
    if (entry === undefined) return;
    this.loaded.delete(modelId);
    await entry.context.dispose();
    await entry.model.dispose();
  }
}

/** Singleton — one engine per process (matches the single-agent-run invariant, ADR-0013). */
let engine: LlamaEngineElectron | null = null;
export function llamaEngine(): LlamaEngine {
  engine ??= new LlamaEngineElectron();
  return engine;
}
