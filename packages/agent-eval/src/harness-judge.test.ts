import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * `judgeComplete` builds the driver-side grader — a model call INDEPENDENT of the agent under test. The
 * case that matters most is the one where no judge can be built: it must return a hard-coded FAILING
 * verdict rather than throw or, worse, pass. A judge that cannot run must not grade anything as correct.
 */
describe('judgeComplete', () => {
  // Each case re-imports the module graph after `vi.resetModules()`; warm the transform cache once so the
  // first case does not pay the cold-start cost inside its own 5s budget.
  beforeAll(async () => {
    await import('./harness-judge');
  }, 60_000);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock('@tepegoz/model-gateway');
  });

  async function load(env: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    return import('./harness-judge');
  }

  const messages = { system: 'grade this', user: 'evidence' };

  it('fails closed with a zero-confidence verdict when no API key is configured', async () => {
    const { judgeComplete } = await load({
      TEPEGOZ_EVAL_PROVIDER: 'anthropic',
      TEPEGOZ_EVAL_API_KEY: '',
    });
    const verdict = JSON.parse(await judgeComplete()(messages)) as {
      pass: boolean;
      confidence: number;
      reason: string;
    };
    expect(verdict.pass).toBe(false);
    expect(verdict.confidence).toBe(0);
    expect(verdict.reason).toContain('no judge model configured');
  });

  it('fails closed when the provider id is not one the gateway can actually run', async () => {
    const { judgeComplete } = await load({
      TEPEGOZ_EVAL_PROVIDER: 'not-a-provider',
      TEPEGOZ_EVAL_API_KEY: 'sk-test',
    });
    const verdict = JSON.parse(await judgeComplete()(messages)) as { pass: boolean };
    expect(verdict.pass).toBe(false);
  });

  it.each(['anthropic', 'openai', 'gemini', 'kimi', 'nova', 'deepseek', 'xai', 'groq'])(
    'builds a %s judge that classifies with a bounded, JSON-formatted call',
    async (provider) => {
      const complete = vi.fn().mockResolvedValue({ text: '{"pass":true}' });
      vi.doMock('@tepegoz/model-gateway', async () => {
        const actual =
          await vi.importActual<typeof import('@tepegoz/model-gateway')>('@tepegoz/model-gateway');
        class StubProvider {
          complete = complete;
        }
        return {
          ...actual,
          AnthropicProvider: StubProvider,
          OpenAIProvider: StubProvider,
          GeminiProvider: StubProvider,
          KimiProvider: StubProvider,
          NovaProvider: StubProvider,
          DeepSeekProvider: StubProvider,
          XaiProvider: StubProvider,
          GroqProvider: StubProvider,
        };
      });
      const { judgeComplete } = await load({
        TEPEGOZ_EVAL_PROVIDER: provider,
        TEPEGOZ_EVAL_API_KEY: 'sk-test',
      });

      expect(await judgeComplete()(messages)).toBe('{"pass":true}');

      const call = complete.mock.calls[0] ?? [];
      const req = call[0] as {
        provider: string;
        capability: string;
        model: string;
        maxTokens: number;
        timeoutMs: number;
        responseFormat: string;
        messages: { role: string; content: string }[];
      };
      expect(req.provider).toBe(provider);
      expect(req.capability).toBe('classify');
      expect(req.model.length).toBeGreaterThan(0);
      expect(req.maxTokens).toBe(512);
      expect(req.timeoutMs).toBe(60_000);
      expect(req.responseFormat).toBe('json');
      expect(req.messages).toEqual([
        { role: 'system', content: 'grade this' },
        { role: 'user', content: 'evidence' },
      ]);
      // Every call is abortable — the harness must be able to stop a judge that hangs.
      expect(call[1]).toBeInstanceOf(AbortSignal);
    },
  );
});
