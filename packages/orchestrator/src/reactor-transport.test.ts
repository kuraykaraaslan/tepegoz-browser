import { beforeEach, describe, it, expect } from 'vitest';
import { CapabilityRegistry, ToolGateway } from '@tepegoz/capability-plane';
import { ModelGateway, type CanonResponse, type ModelProvider } from '@tepegoz/model-gateway';
import type { AIProvider } from '@tepegoz/shared-types';
import Reactor from './reactor';
import { act, finish, resetReactorFixtures, script, tools } from './reactor.test-support';

beforeEach(resetReactorFixtures);

describe('Reactor.run — streaming transport + failure-return paths', () => {
  const req = (goal = 'do it') => ({
    goal,
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  it('routes the decision call through generateStream on the native arm when onModelDelta is wired', async () => {
    // Native mode's text is empty except on the "finish" turn (reactor.ts's own comment: "usually
    // pure tool call with empty text"), so this provider streams the settled text on the finish call
    // and answers with a real toolCalls entry (matching parseNativeDecision's shape) on the act call.
    class NativeProvider implements ModelProvider {
      readonly id: AIProvider = 'anthropic';
      readonly supportsNativeTools = true;
      private turn = 0;
      complete(): Promise<CanonResponse> {
        const isFirst = this.turn === 0;
        this.turn += 1;
        return Promise.resolve(
          isFirst
            ? {
                text: '',
                stopReason: 'tool_use',
                usage: { inputTokens: 1, outputTokens: 1 },
                toolCalls: [
                  {
                    name: 'agent_emit_decision',
                    input: {
                      action: 'act',
                      tool: 'browser_get_elements',
                      args: {},
                      rationale: 'r',
                    },
                  },
                ],
              }
            : {
                text: finish,
                stopReason: 'end',
                usage: { inputTokens: 1, outputTokens: finish.length },
                toolCalls: [
                  { name: 'agent_emit_decision', input: { action: 'finish', summary: 'done' } },
                ],
              },
        );
      }
    }
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    ModelGateway.reset();
    ModelGateway.register(new NativeProvider());
    const deltas: string[] = [];
    const res = await Reactor.run(req(), { onModelDelta: (d) => deltas.push(d) });
    expect(res.stoppedReason).toBe('completed');
    expect(deltas.join('')).toContain('finish');
  });

  it('never streams on the JSON decision arm, even when onModelDelta is wired', async () => {
    // A non-native provider's entire text IS the decision -- action, tool id, args, rationale, the
    // working-state ledger. Streaming that would show raw decision JSON growing in the "working"
    // indicator on every tool-calling step, which is exactly the interactive-streaming DoD's named
    // failure ("streaming text while buffering tool calls"). `supportsNativeTools` absent -> JSON arm.
    class JsonOnlyProvider implements ModelProvider {
      readonly id: AIProvider = 'kimi';
      private turn = 0;
      constructor(private readonly replies: string[]) {}
      complete(): Promise<CanonResponse> {
        const text = this.replies[this.turn] ?? finish;
        this.turn += 1;
        return Promise.resolve({
          text,
          stopReason: 'end',
          usage: { inputTokens: 1, outputTokens: text.length },
          toolCalls: [],
        });
      }
    }
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    ModelGateway.reset();
    ModelGateway.register(new JsonOnlyProvider([act('browser_get_elements'), finish]));
    const deltas: string[] = [];
    const res = await Reactor.run(
      { ...req(), provider: 'kimi' as const },
      { onModelDelta: (d) => deltas.push(d) },
    );
    expect(res.stoppedReason).toBe('completed');
    expect(deltas).toEqual([]);
  });

  it('stops with the classified stop reason when the model call itself throws', async () => {
    class ThrowingProvider implements ModelProvider {
      readonly id: AIProvider = 'anthropic';
      complete(): Promise<CanonResponse> {
        return Promise.reject(new Error('upstream socket reset'));
      }
    }
    ModelGateway.reset();
    ModelGateway.register(new ThrowingProvider());
    const res = await Reactor.run(req());
    expect(res.stoppedReason).toBe('tool_error'); // classifyRuntimeError → 'unknown' → 'tool_error'
    expect(res.failure?.kind).toBe('unknown');
    expect(res.outcomes).toHaveLength(0);
  });

  it('fails closed once a retryable tool failure exceeds maxRecoveryAttempts', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    CapabilityRegistry.reset();
    CapabilityRegistry.register({
      descriptor: {
        id: 'browser_get_elements',
        description: 'flaky read',
        dangerClass: 'read',
        source: 'builtin',
        inputSchema: { type: 'object' },
        requiresIdempotencyKey: false,
      },
      inputSchema: {
        safeParse: (data: unknown) =>
          typeof data === 'object' && data !== null
            ? { success: true as const, data }
            : { success: false as const, error: { issues: ['expected an object'] } },
      },
      handler: () => {
        throw new Error('transient read failure');
      },
    });
    script([
      act('browser_get_elements'),
      act('browser_get_elements'),
      act('browser_get_elements'),
      finish,
    ]);
    const res = await Reactor.run(req(), { maxRecoveryAttempts: 1 });
    expect(res.failure?.retryable).toBe(true);
    expect(res.stoppedReason).not.toBe('completed');
    expect(res.outcomes.length).toBeGreaterThanOrEqual(2);
  });
});
