import {
  AnthropicProvider,
  DeepSeekProvider,
  GeminiProvider,
  GroqProvider,
  KimiProvider,
  ModelRouter,
  NovaProvider,
  OpenAIProvider,
  XaiProvider,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { isRunnableProvider, type AIProvider, type EvalScenario } from '@tepegoz/shared-types';
import { scoreScenario, type ScoreResult } from './scorer';
import { judgeScenario, type JudgeMessages } from './judge';
import type { JudgeSample } from './calibration';
import type { EvalOut } from './harness-out';
import { API_KEY, PROVIDER_ID } from './harness-config';

/** A driver-side judge model call (independent of the agent under test), built from the live env key. */
export function judgeComplete(): (m: JudgeMessages) => Promise<string> {
  if (!isRunnableProvider(PROVIDER_ID as AIProvider) || API_KEY.length === 0) {
    return () =>
      Promise.resolve('{"pass":false,"confidence":0,"reason":"no judge model configured"}');
  }
  const id = PROVIDER_ID as AIProvider;
  let provider: ModelProvider;
  if (id === 'openai') provider = new OpenAIProvider({ apiKey: API_KEY });
  else if (id === 'gemini') provider = new GeminiProvider({ apiKey: API_KEY });
  else if (id === 'kimi') provider = new KimiProvider({ apiKey: API_KEY });
  else if (id === 'nova') provider = new NovaProvider({ apiKey: API_KEY });
  else if (id === 'deepseek') provider = new DeepSeekProvider({ apiKey: API_KEY });
  else if (id === 'xai') provider = new XaiProvider({ apiKey: API_KEY });
  else if (id === 'groq') provider = new GroqProvider({ apiKey: API_KEY });
  else provider = new AnthropicProvider({ apiKey: API_KEY });
  const route = ModelRouter.route({
    capability: 'exec',
    costSaver: false,
    localAvailable: false,
    provider: id,
  });
  return async ({ system, user }) => {
    const res = await provider.complete(
      {
        provider: id,
        model: route.model,
        capability: 'classify',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        maxTokens: 512,
        timeoutMs: 60_000,
        responseFormat: 'json',
      },
      new AbortController().signal,
    );
    return res.text;
  };
}

/** Score ONE trial's output (ground-truth first; LLM-judge for judge-only scenarios in the live tier). */
export async function scoreTrial(
  scenario: EvalScenario,
  out: EvalOut,
  judge: ((m: JudgeMessages) => Promise<string>) | null,
  judgeSamples: JudgeSample[],
): Promise<ScoreResult> {
  const obs = { finalPageText: out.finalPageText ?? '', summary: out.summary ?? '' };
  let score = scoreScenario({
    scenario,
    ...obs,
    ...(out.stoppedReason !== undefined ? { stoppedReason: out.stoppedReason } : {}),
  });
  if (score.method === 'deferred-judge' && judge !== null) {
    const verdict = await judgeScenario(scenario, obs, judge);
    score = { ok: verdict.pass, method: 'deferred-judge', reason: `judge: ${verdict.reason}` };
    judgeSamples.push({ id: scenario.id, pass: verdict.pass });
  }
  return score;
}
