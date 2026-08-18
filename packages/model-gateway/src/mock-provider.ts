import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, ModelProvider } from './types';
import { contentLength } from './content';

/**
 * Deterministic provider for tests and offline dev (also used as the default golden-LLM replay
 * provider for agent-eval). Honors the abort signal and an optional delay.
 */
export class MockProvider implements ModelProvider {
  readonly id: AIProvider;

  constructor(
    private readonly reply: string = 'ok',
    private readonly delayMs: number = 0,
    id: AIProvider = 'anthropic',
  ) {
    this.id = id;
  }

  async complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    if (signal.aborted) {
      throw new Error('aborted');
    }
    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, this.delayMs);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        });
      });
    }
    const inputTokens = req.messages.reduce((n, m) => n + contentLength(m.content), 0);
    return {
      text: this.reply,
      stopReason: 'end',
      usage: { inputTokens, outputTokens: this.reply.length },
      toolCalls: [],
    };
  }
}
