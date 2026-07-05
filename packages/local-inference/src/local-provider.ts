import { AppError } from '@tepegoz/libs';
import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, ModelProvider } from '@tepegoz/model-gateway';
import type { GenerateOptions, LocalProviderConfig } from './types';
import { grammarFor, toLocalTurns } from './map-request';
import { fromLocalResult } from './map-response';
import { LocalMessages } from './messages';

/**
 * On-device (local) model adapter (L7) — an in-process {@link ModelProvider} backed by a downloaded
 * GGUF model via the injected {@link LlamaEngine}. NO API key: it resolves the selected model through
 * `config.resolveModel()` (driven by `prefs.localProvider` + install state in the app). The model is
 * kept warm because `engine.load` is idempotent per id, so back-to-back Reactor steps reuse it.
 * `responseFormat:'json'` is enforced with a GBNF grammar so a small model can't emit prose/fences.
 */
export class LocalProvider implements ModelProvider {
  readonly id: AIProvider = 'local';
  private readonly config: LocalProviderConfig;

  constructor(config: LocalProviderConfig) {
    this.config = config;
  }

  async complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    const selected = this.config.resolveModel();
    if (selected === null) {
      // Surfaces like "No API key configured" — the run cannot proceed without a model.
      throw new AppError(LocalMessages.NoModelSelected, 503);
    }
    const handle = await this.config.engine.load(
      selected.modelId,
      selected.modelPath,
      selected.ctxSize,
    );

    const opts: GenerateOptions = { maxTokens: req.maxTokens, signal };
    const grammar = grammarFor(req);
    if (grammar !== undefined) opts.grammar = grammar;
    const temperature = this.config.sampling?.temperature;
    if (temperature !== undefined) opts.temperature = temperature;
    const topP = this.config.sampling?.topP;
    if (topP !== undefined) opts.topP = topP;

    const result = await this.config.engine.generate(handle, toLocalTurns(req), opts);
    return fromLocalResult(result);
  }
}
