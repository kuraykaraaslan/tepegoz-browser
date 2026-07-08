import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, ModelProvider } from './types';

/**
 * A provider that replays a fixed SEQUENCE of canned responses, one per `complete()` call. Unlike
 * {@link MockProvider} (which returns the same reply every time), this drives a multi-step reactive run
 * deterministically: reply[0] answers the Planner, reply[1..] answer each Reactor turn. It is the
 * backbone of the AI-1 eval harness's deterministic (no-cloud-key) tier — the app's env-gated eval hook
 * builds one from a replies file so the same sequence crosses the harness → main-process boundary with
 * no closure passing.
 *
 * Once the sequence is exhausted it keeps returning the LAST reply, so a sequence that ends with a
 * `finish` decision terminates the loop cleanly (and the reactor's Loop Detector caps any accidental
 * repeat). It is deliberately orchestrator-agnostic — it never parses the decision shape.
 */
export class ScriptedProvider implements ModelProvider {
  readonly id: AIProvider;
  private turn = 0;
  private readonly replies: readonly string[];

  constructor(replies: readonly string[], id: AIProvider = 'anthropic') {
    this.replies = replies.length > 0 ? replies : ['ok'];
    this.id = id;
  }

  complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    if (signal.aborted) throw new Error('aborted');
    const index = Math.min(this.turn, this.replies.length - 1);
    const text = this.replies[index] ?? 'ok';
    this.turn += 1;
    const inputTokens = req.messages.reduce((n, m) => n + m.content.length, 0);
    return Promise.resolve({
      text,
      stopReason: 'end',
      usage: { inputTokens, outputTokens: text.length },
      toolCalls: [],
    });
  }
}
