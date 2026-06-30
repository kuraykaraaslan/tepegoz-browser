import { AppError } from '@tepegoz/libs';
import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, ModelProvider } from './types';
import { TokenLedger } from './token-ledger';

/**
 * The single entry point for every model call (L7), provider-agnostic. Enforces required
 * max_tokens + timeout (internal-ai-rules: no uncapped/untimed call) and records usage to the
 * Token Ledger. Providers are registered via the provider pattern and selected per request.
 */
export class ModelGateway {
  private static readonly providers = new Map<AIProvider, ModelProvider>();

  static reset(): void {
    ModelGateway.providers.clear();
  }

  static register(provider: ModelProvider): void {
    ModelGateway.providers.set(provider.id, provider);
  }

  static async complete(req: CanonRequest): Promise<CanonResponse> {
    if (!Number.isInteger(req.maxTokens) || req.maxTokens <= 0) {
      throw new AppError('max_tokens is required and must be a positive integer', 400);
    }
    if (!Number.isInteger(req.timeoutMs) || req.timeoutMs <= 0) {
      throw new AppError('timeout is required and must be a positive integer', 400);
    }

    const provider = ModelGateway.providers.get(req.provider);
    if (provider === undefined) {
      throw new AppError(`No model provider registered for "${req.provider}"`, 503);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, req.timeoutMs);
    try {
      const res = await provider.complete(req, controller.signal);
      TokenLedger.record(provider.id, req.model, req.capability, res.usage);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
