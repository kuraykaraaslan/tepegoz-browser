import type { AIProvider } from '@tepegoz/shared-types';
import type {
  CanonRequest,
  CanonResponse,
  CanonStopReason,
  CanonToolCall,
  ModelProvider,
} from './types';
import { contentLength } from './content';

/**
 * One scripted turn in its structured form. A bare `string` is the same thing with only `text` set, and
 * stays the shape every existing replies file uses.
 *
 * `toolCalls` exists so the deterministic tier can drive the **native** decision transport (S1): with
 * JSON-in-text a scripted decision is just a string, but a native `tool_use` turn carries no decision
 * prose at all, so a string-only script could never exercise that arm. Being able to script both is what
 * makes the two arms comparable off a cloud key.
 */
export interface ScriptedReply {
  text?: string;
  toolCalls?: readonly CanonToolCall[];
  stopReason?: CanonStopReason;
}

export type ScriptedTurn = string | ScriptedReply;

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
  private readonly replies: readonly ScriptedTurn[];

  constructor(replies: readonly ScriptedTurn[], id: AIProvider = 'anthropic') {
    this.replies = replies.length > 0 ? replies : ['ok'];
    this.id = id;
  }

  complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    if (signal.aborted) throw new Error('aborted');
    const index = Math.min(this.turn, this.replies.length - 1);
    const reply = this.replies[index] ?? 'ok';
    this.turn += 1;
    const turn: ScriptedReply = typeof reply === 'string' ? { text: reply } : reply;
    const text = turn.text ?? '';
    const toolCalls = [...(turn.toolCalls ?? [])];
    // A turn that carries tool calls but no explicit stop reason IS a tool_use turn — scripting the
    // stop reason by hand every time would be a footgun the native arm silently fails on.
    const stopReason: CanonStopReason = turn.stopReason ?? (toolCalls.length > 0 ? 'tool_use' : 'end');
    const inputTokens = req.messages.reduce((n, m) => n + contentLength(m.content), 0);
    const outputTokens = text.length + toolCalls.reduce((n, c) => n + JSON.stringify(c.input).length, 0);
    return Promise.resolve({ text, stopReason, usage: { inputTokens, outputTokens }, toolCalls });
  }
}
